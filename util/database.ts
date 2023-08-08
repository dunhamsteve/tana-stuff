import { initialize } from "esbuild"

interface Node {
    id: string
    props: {
        created: number
        name?: string
        description?: string
        _ownerId: string  // is this optional?
        _docType?: string
        _metaNodeId?: string
    }
    children?: string[]  //optional?
    meta: Record<string, string>
}

export interface Database { docs: Node[] }

type Ring = string | null
type Value = string | number | string[] | null
type Triple = [string, string, Value]
type Pattern = [Ring, Ring, Ring]

type Vars = Record<string, Value>
type OptVars = Vars | undefined

// match a value 
// - if needle is a variable "$x" then add to a fresh copy of vars
// - if needle is null, match all
// - if match fails return undefined
// TODO - since we're a generator, we could prealloc all vars in an array and just mutate in place
function check(v: Value, needle: Value, vars: OptVars): OptVars {
    // We chain S,V,P together before inspecting the result
    if (!vars) return vars
    if (needle == null) return vars
    if (typeof needle == 'string' && needle.startsWith('$')) {
        if (needle in vars) needle = vars[needle]
        else return { ...vars, [needle]: v }
    }
    if (v == needle) { return vars }
}

function parse_pat(x: string): Pattern {
    let pts = x.trim().split(' ').map(p => p == '-' || p == '_' ? null : p)
    return [pts[0], pts[1], pts[2]]
}

function parse_query(line: string) {
    return line.split('.').map(parse_pat)
}

function literal(v: Value, vars: Vars): string | undefined{
    v = vars[v as any] || v
    if (typeof v == 'string' && !v.startsWith('$')) {
        return v
    }
}

function *scan(tt: Triple[], v: string, col: 0|1) {
    // invariant f(i-1) false, f(j) true
    let i =0
    let j = tt.length
    while (i < j) {
        let h = (i + j) >> 1
        if (tt[i][col] >= v) { 
            j = h
        } else {
            i = h + 1
        }
    }
    for (;tt[j][col] == v; j++) {
        yield tt[j]
    }
}

/**
 * Turns tana store into triple store, flattening a little.
 * Provides crude datalog-like queries
 */
export
class DataStore {
    svp: Triple[] = []
    vsp: Triple[]
    constructor(data: Database) {
        // build lookup table
        let nodes: Record<string, Node> = {}
        for (let n of data.docs) {
            n.meta = {}
            nodes[n.id] = n
        }

        for (let node of data.docs) {
            // if (!node.id.startsWith('SYS')) continue
            let k: keyof (typeof node.props)
            for (k in node.props) {
                let v = node.props[k]
                if (v != null)
                    this.svp.push([node.id, k, v])
            }
            if (node.children) {
                this.svp.push([node.id, 'children', node.children])
                for (let id of node.children) {
                    let n = nodes[id]
                    if (!n) { 
                        // console.error(`child ${id} missing on ${node.id}`); 
                        continue 
                    }
                    if (n.props._docType !== 'tuple') { continue }
                    if (!n.children) { console.error(`empty tuple on ${id}`); continue }
                    // decode tuple
                    let field = n.children[0]
                    let vkeys = n.children.slice(1)
                    vkeys.forEach(v => this.svp.push([node.id, field, v]))
                }
            }
        }
        this.svp.sort()
        this.vsp = this.svp.slice()
        this.vsp.sort()
        console.log(this.svp.length, 'triples')
    }
    // taking some liberties.
    *unify(pat: Pattern, vars: Vars) {
        // this could be faster - we're doing a table scan.
        let range : Iterable<Triple>
        let key : string | undefined
        if (key = literal(pat[0], vars)) {
            range = scan(this.svp, key, 0)
        } else if (key = literal(pat[1], vars)) {
            range = scan(this.vsp, key, 1)
        } else {
            range = this.svp
        }
        for (let [s, v, p] of this.svp) {
            let tmp: OptVars = vars
            tmp = check(s, pat[0], tmp)
            tmp = check(v, pat[1], tmp)
            tmp = check(p, pat[2], tmp)
            if (tmp) yield tmp
        }
    }

    *_run(pats: Pattern[], vars: Vars): Generator<Vars, void, unknown> {
        if (pats.length) {
            let [hd, ...tl] = pats
            for (let tmp of this.unify(hd, vars)) {
                yield* this._run(tl, tmp)
            }
        } else {
            yield vars
        }
    }

    query(query: string) {
        let pats = parse_query(query)
        let rval = []
        for (let res of this._run(pats, {})) {
            rval.push(res)
        }
        return rval
    }
}

