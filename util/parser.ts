import { Expr, O, Select, TableSpec } from "./types"

let debug = console.log
debug = (...any) => {}

type Pred = (k:string) => boolean

let reserved = ["on", "select", "left","where"]

// operator precedence table
// maybe fix & | unless sql demands it as is
// https://www.sqlite.org/lang_expr.html#operators_and_parse_affecting_attributes
type Tag = 'P' | 'I'
type Level = string[] & {tag?: Tag}
let level = (tag:Tag, ...ops:Level) => (ops.tag=tag,ops)

let operators = [
    level('I', "or"),
    level('I', "and"),
    level('P', 'not'),
    level('I', "=", "==", "<>"),
    level('I', "<",">","<=",">="),
    level('I', "&", "|", "<<", ">>"),
    level('I', "+","-"),
    level('I', "*","/","%"),
    level('P', "+","-"), // prefix + is a coersion hack in sqlite
]

export function tokenize(sql: string) {
    // refine this
    let toks = []
    for (let tok of sql.match(/\w+|".*?"|[\d.]+|[<=>]+|'.*?'|\[.*?\]|\S/g) || []) {
        let c = tok[0]
        if (c != '"' && c != "'") tok = tok.toLowerCase()
        if (c=='"' || c == '[') tok = tok.slice(1,tok.length-1)
        toks.push(tok)
    }
    return toks
}

export function parser(sql: string) {
    let assert = <A>(value:A, msg?: string): A => {  
        if (!value) 
            throw new Error(`${msg??"parse error"} at ${toks[p]}`); 
        return value 
    }
    // refine this
    let toks = tokenize(sql)
    debug(toks)
    let p = 0
    let isident = (x: string) => !!(x && x.match(/^\w+$/) && !reserved.includes(x))
    let next = () => toks[p++]
    let pred = (p: Pred, msg:string) => { let n = next(); assert(p(n),msg); return n }
    let ident = () => pred(isident, 'expected ident')
    let expect = (k:string) => assert(next()==k,`expected ${k}`)
    let maybe = (k: string) => toks[p] == k && next()
    let pQName = (): Expr => {
        let ns
        let name = ident()
        if (maybe('.')) {
            ns = name, name = ident()
        }
        return ['QN', ns, name]
    }

    // TODO - need to do parens, thinking about flattening vs associativity of left join.
    let pSpec = (left: boolean): TableSpec => {
        let name = ident()
        let as = (isident(toks[p]) || maybe('as')) ? ident() : name
        let on = maybe('on') ? pExpr() : undefined
        return {name, left, as, on}
    }
    let pFrom = (): TableSpec[] => {
        let rval: TableSpec[] = []
        if (maybe('from')) {
            rval.push(pSpec(false))
            for (;;) {
                if (maybe(',')) {
                    rval.push(pSpec(false))
                } else if (maybe('left')) {
                    maybe('outer')
                    expect('join')
                    rval.push(pSpec(true))
                } else if (maybe('(')) {
                    rval = rval.concat(pFrom())
                    expect(')')
                } else {
                    break
                }
            }
        }
        return rval
    }
    let pSelect = (): Select => {
        expect("select")
        let projection = [ pExpr() ]
        while (maybe(',')) { projection.push(pExpr()) }
        let from = pFrom()
        let where
        if (maybe('where')) where = pExpr()
        return {select: projection, from, where}
    }
    let isnumber = (k:string) => k.match(/^[\d.]+$/)
    let pAExpr = (): Expr => {
        let t = toks[p]
        if (isnumber(t)) { return ['LIT', ['NUM', Number(next())]] }
        if (isident(t))  { return pQName() }
        if (toks[p][0]=="'") { next(); return ['LIT',['STR', t.slice(1,t.length-1)]]}
        assert(false,'expected literal or identifier')
        if (true) throw new Error()
    }

    let maybeOper = (prec: number, tag: string): O<[string,number]> => {
        let q = p
        let op = toks[q++]
        // not foo infix is represented as "not_foo" in the table and ast
        if (op == 'not' && tag == 'I') op = 'not_'+toks[q++]
        for (;prec<operators.length;prec++) {
            let x = operators[prec]
            if (x.tag == tag && x.includes(op)) {
                p = q
                debug('ISOP',op,prec,tag)
                return [op,prec]
            }
        }
        debug('NOTOP',op,prec,tag)
    }

    // This is a pratt parser for expressions
    // TODO - add postfix operators
    let pExpr = (prec=0): Expr => {
        let left: Expr
        let pfx = maybeOper(0,'P')
        if (pfx) {
            left = ['PFX', pfx[0], pExpr(pfx[1])]
        } else {
            left = pAExpr()
        }
        for (;;) {
            let op = maybeOper(prec, 'I')
            if (!op) break
            left = ['IFX', op[0], left, pExpr(op[1]+1)]
        }
        return left
    }
    return pSelect()
}

