import { parser } from "./parser";
import { Database } from "./sqlite";
import { Expr, Schema, O, QName, Value, Tuple, Index, Infix } from "./types";
import { assert, jlog, tupleCmp } from "./util";

let debug = console.log
debug = () => undefined

type TableInfo = {
    state: number
    schema: Schema
    need: Set<string> // read or projected
    left: boolean
    as: string
    constraint?: Infix
    index?: Index
}

function *initial(): Generator<Value[]> {
    yield []
}

function eachName(expr: O<Expr>, fn: (e:QName) => void) {
    if (!expr) return
    switch (expr[0]) {
        case 'IN':  eachName(expr[1], fn); break
        case 'PFX': eachName(expr[2], fn); break;
        case 'IFX': eachName(expr[2], fn); eachName(expr[3], fn); break
        case 'QN': fn(expr); break
    }
}

type Constraint = {
    expr: Expr
    done: boolean
    // additional bookkeeping, indexes, tables, etc
}

let indexOps = ['<','<=','=','>','>=']

// v1, this just does everything
// v2, we'll return a plan and execute it (with args) below
export function *execute(db: Database, sql: string) {
    let query = parser(sql)

    let col2table: Record<string,string[]> = {}
    let name2table: Record<string,TableInfo> = {}
    let tables: TableInfo[] = []
    
    for (let {name,left,as} of query.from) {
        let schema = db.tables[name]
        assert(schema, `can't find table ${name}`)
        assert(as, `empty as for ${name}`)
        if (schema.idcol) {
            for (let index of schema.indexes) {
                index.columns = index.columns.map(x => x == schema.idcol ? 'rowid' : x)
            }
        }

        const info: TableInfo = { as, schema, left, need: new Set(), state: 0 };
        name2table[as] = info
        tables.push(info)

        for (let col of schema.columns) {
            debug(name,as,col)
            col2table[col] ||= []
            col2table[col].push(as)
        }
    }
    
    // Fill in table names on column references
    // This also collects a list of needed fields for each table.
    function qualify(expr?: Expr) {
        eachName(expr, (expr)=> {
            if (!expr[1]) {
                let n = expr[2]
                let names = col2table[n]
                assert(names, `unknown column ${n}`)
                assert(names.length == 1, `ambiguous name ${n} is in tables ${names}`)
                expr[1] = names[0]
            }
            let table = name2table[expr[1]]
            assert(table, `unknown table ${expr[1]}`)
            if (expr[2] == table.schema.idcol) expr[2] = 'rowid'
            table.need.add(expr[2])
        })
    }
    query.select.forEach(qualify)
    qualify(query.where)
    query.from.forEach(f => qualify(f.on))
    // jlog(query)

    // We're going to ignore ON and LEFT JOIN for the moment
    // How to handle OR?
    // So we have a list of tables that we'll run through in order

    // So I think SQLite is trying to turn ors into in clauses or between clauses
    // and then just top level ands.

    
    // Flatten out constraints into a list of things that are anded together
    let constraints: Constraint[] = []
    function flat(expr?: Expr) {
        if (!expr) return
        if (expr[0] == 'IFX' && expr [1] == 'and') {
            flat(expr[2])
            flat(expr[3])
        } else {
            constraints.push({
                expr,
                done: false
            })
        }
    }
    flat(query.where)

    // Query plan is to topological sort tables by dependencies.
    let plan: TableInfo[] = []
    function visit(info: TableInfo) {
        // Here a dependent is pointing back at us, the constraint can't be resolved until we get to our table
        if (info.state == 1) debug('LOOP', info.as)
        if (info.state > 0) return
        let {indexes} = info.schema
        info.state = 1 // scanning
        for (let constraint of constraints) {
            if (constraint.done) continue
            let {expr} = constraint
            if (expr[0] == 'IFX') {
                if (expr[3][0] == 'QN' && expr[3][1] == info.as) {
                    // Flip expression so our QName comes first
                    let op = {"=":"=","<":">","<=":">=",">=":"<=",">":"<"}[expr[1]]
                    if (op) constraint.expr = expr = ['IFX',op,expr[3],expr[2]]
                }
                if (expr[2][0] == 'QN' && expr[2][1] == info.as) {
                    let op = expr[1]
                    let field = expr[2][2]
                    let right = expr[3]
                    let index = indexes.find(ix => ix.columns[0] == field)
                    // These are the operations we know at the moment
                    // We'll handle backwards and like at some point
                    if (index && indexOps.includes(op)) {
                        // we grab the first matching index and run with it
                        debug('MATCH', info.as, field, 'for', expr)
                        debug('INDEX is', index)
                        constraint.done = true // pre-mark this
                        eachName(right, qname => qname[1] && visit(name2table[qname[1]]))
                        info.constraint = expr
                        info.index = index
                        break
                    } else if (index) { debug(`Can't index for ${op} on ${info.as}.${field}`) }
                }
            }
        }
        plan.push(info)
        info.state = 2 // done
        // At this point, in execution below, additional constraints are filtered
        // and we do a rowid join if necessary
    }
    tables.forEach(visit)
    plan.reverse()

    debug('order', plan.map(info => info.as))
    debug('constraints', constraints)
    let fields: string[] = []
    function isFree(expr: Expr) {
        let free = true
        eachName(expr, ([_,t,n]) => free = free && fields.includes(t+'.'+n))
        debug('isFree', expr, free)
        return free
    }
    
    function eval_(tuple: Tuple, expr: Expr): any {
        switch (expr[0]) {
            case 'LIT': return expr[1][1]
            case 'QN':  return tuple[fields.indexOf(expr[1]+'.'+expr[2])]
            case 'IFX':
                let a = eval_(tuple, expr[2]), b =  eval_(tuple, expr[3])
                switch (expr[1]) {
                    case '+':  return a + b
                    case '-':  return a - b
                    case '*':  return a + b
                    case '/':  return a / b // FIXME Inf?
                    case '=':  return a == b
                    case '<':  return a < b
                    case '>':  return a > b
                    case '<=': return a <= b
                    case '>=': return a >= b
                    default: assert(false, `unhandled binop ${expr[1]}`)
                }
        }
    }

    // project contains 0 for rowid or 1-based index for 
    function *scan(input: Generator<Tuple>, table: TableInfo, project: number[]) {
        debug('SCAN',table.as, project, (project.map(i => table.schema.columns[i])))
        for (let inTuple of input) {
            for (let newTuple of db.seek(table.schema.page,[])) {
                yield inTuple.concat(project.map(i => newTuple[i]))
            }
        }
    }

    function *filter(output: Generator<Tuple>, constraint: Expr) {
        debug('FILTER',constraint)
        for (let tuple of output) {
            if (eval_(tuple, constraint)) yield tuple
        }
    }

    // TODO - switch to representation of a range (a,b]
    function *indexEq(input: Generator<Tuple>, index: Index, op: string, constraint: Expr, project: number[]) {
        debug('INDEXEQ', index, constraint, project)
        let ix = indexOps.indexOf(op)
        if (ix < 0) assert(false, `unhandled op ${op}`)
        for (let inTuple of input) {
            let value = eval_(inTuple, constraint)
            let lower = ix > 1 ? [value] : []
            if (op == '<') debugger
            for (let tuple of db.seek(index.page, lower)) {
                const cmp = tupleCmp(tuple,[value]);
                if (op == '='  && cmp) break
                if (op == '>'  && !cmp) continue
                if (op == '<'  && cmp >= 0) break
                if (op == '<=' && cmp > 0) break
                yield inTuple.concat(project.map(i=> tuple![i]))
            }
        }
    }

    function dofilters() {
        for (let constraint of constraints) {
            if (!constraint.done && isFree(constraint.expr)) {
                debug('discharge', constraint)
                output = filter(output, constraint.expr)
                constraint.done = true
            }
        }
    }

    // we need to identify rowid constraints and reorder the tables
    // TODO - On clauses, etc
    // we should start with a dummy table (one empty tuple) and attach bare constraints
    
    // So we loop over the tables in order, building up an async generator
    // Try to pick good indexes, discharge constraints as soon as possible.
    let output = initial()
    for (;;) {
        // discharge available constraints
        // TODO - precalc this (above) and move into plan
        // Plan will be sequence of index, filter, whatever
        dofilters()
        const table = plan.pop()
        if (!table) break
        // find appropriate index or scan table
        debug(table.as, 'CONSTRAINT', table.constraint)
        if (table.constraint && table.index) {
            let op = table.constraint[1]
            let ty = table.index.type
            if (ty == 'rowid') {
                    let project: number[] = []
                    table.index.columns.forEach((v,i) => {
                        if (table.need.has(v)) {
                            debug('project',v)
                            fields.push(table.as+'.'+v)
                            project.push(i)
                        }
                    })
                    output = indexEq(output, table.index, op, table.constraint[3], project)
            } else {
                debug('INDEX', table.index.name)
                let project: number[] = []
                table.index.columns.forEach((v,i) => {
                    if (table.need.has(v)|| v == 'rowid') {
                        debug('project',v)
                        fields.push(table.as+'.'+v)
                        project.push(i)
                    }
                })
                output = indexEq(output, table.index, op, table.constraint[3], project)
                debug('rowid to table?', table.as)
                // for any columns picked up by the index
                dofilters()

                let project2: number[] = []
                table.schema.columns.forEach((v,i) => {
                    let key = table.as+'.'+v
                    if (table.need.has(v) && ! fields.includes(key)) {
                        debug('project', v, key)
                        fields.push(key)
                        project2.push(i)
                    }
                })
                
                if (project2.length) {
                    debug('YES')
                    output = indexEq(output,table.schema.indexes[0], '=', ['QN',table.as, 'rowid'], project2)
                }
            }
        } else {
            // move scan up here
            let project: number[] = []
            table.schema.columns.forEach((v,i) => {
                if (table.need.has(v)) {
                    fields.push(table.as+'.'+v)
                    if (v == table.schema.idcol) i = 0  
                    project.push(i)
                }
            })
            debug('SCAN',table,'projecting',project)
            output = scan(output, table, project)
        }
    }
    debug(fields)
    for (let tuple of output) {
        yield query.select.map(e => eval_(tuple, e))
    }
    
    // and sort/distinct/etc
}
