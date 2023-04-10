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

interface Database { docs: Node[] }

type Ring = string | null
type Value = string | number | string[] | null
type Triple = [string, string, Value]
type Pattern = [Ring, Ring, Ring]

type Vars = Record<string, Value>
type MVars = Vars | undefined

function check(v: Value, needle: Value, vars: MVars): MVars {
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

/**
 * Turns tana store into triple store, flattening a little.
 * Provides crude datalog-like queries
 */
export
class DataStore {
    svp: Triple[] = []
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
        console.log(this.svp.length, 'triples')
    }
    // taking some liberties.
    *unify(pat: Pattern, vars: Vars) {
        // this could be faster - we're doing a table scan.
        for (let [s, v, p] of this.svp) {
            let tmp: MVars = vars
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

