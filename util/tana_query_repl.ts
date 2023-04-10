import {readFileSync} from 'fs'

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
    meta: Record<string,string>
}

interface Database {
    docs: Node[]
}


let data: Database = JSON.parse(readFileSync('dist/out.json','utf8'))

// build lookup table
let nodes: Record<string,Node> = {}

for (let n of data.docs) {
    // if (!n.id.startsWith('SYS')) continue
    n.meta = {}
    nodes[n.id] = n
}

type Ring = string | null
type Value = string|number|string[]|null
type Triple = [string,string,Value]
type Pattern = [Ring, Ring, Ring]

let svp: Triple[] = []

for (let node of data.docs) {
    // if (!node.id.startsWith('SYS')) continue
    let k : keyof (typeof node.props)
    for (k in node.props) {
        let v = node.props[k]
        if (v != null)
            svp.push([node.id, k, v])
    }
    if (node.children) {
        svp.push([node.id,'children',node.children])
        for (let id of node.children) {
            let n = nodes[id]
            if (!n) { console.error(`child ${id} missing on ${node.id}`); continue }
            if (n.props._docType !== 'tuple') { continue }
            if (!n.children) { console.error(`empty tuple on ${id}`); continue}
            // decode tuple
            let field = n.children[0]
            let vkeys = n.children.slice(1)
            vkeys.forEach(v => svp.push([node.id, field, v]))
        }
    }
}

svp.sort()

// for (let [s,v,p] of svp) console.log(s,v,p)

console.log(svp.length, 'triples')

type Vars = Record<string,Value>
type MVars = Vars | undefined
function check(v: Value, needle: Value, vars: MVars): MVars {
    if (!vars) return vars
    if (needle == null) return vars
    if (typeof needle == 'string' && needle.startsWith('$')) {
        if (needle in vars) needle = vars[needle]
        else return {...vars, [needle]: v}
    }
    if (v == needle) { return vars }
    
}
// taking some liberties.
function *unify(pat: Pattern, vars: Vars) {
    // this could be faster - we're doing a table scan.
    for (let [s,v,p] of svp) {
        let tmp: MVars = vars
        tmp = check(s,pat[0],tmp)
        tmp = check(v,pat[1],tmp)
        tmp = check(p,pat[2],tmp)
        if (tmp) yield tmp
    }
}

function *run_query(pats: Pattern[], vars: Vars): Generator<Vars, void, unknown> {
    if (pats.length) {
        let [hd,...tl] = pats
        for (let tmp of unify(hd, vars)) {
            yield *run_query(tl, tmp)
        }
    } else {
        yield vars
    }
}

function parse_pat(x: string): Pattern {
    let pts = x.trim().split(' ').map(p => p == '-' || p == '_' ? null : p)
    return [pts[0],pts[1], pts[2]]
}

function parse_query(line: string) {
    return line.split('.').map(parse_pat)
}

const readline = require('readline');
async function repl() {
    console.log('REPL\nexamples:\n');
    console.log('    $id name field-definition . $e - $id . $e name $name');
    console.log('    - SYS_A13 $e . $e name $name');
    console.log('    $meta SYS_A13 SYS_T01 . $e _metaNodeId $meta . $e name $name');
    console.log();
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
    rl.prompt('> ')
    for await (let l of rl) {
        
        let line: string = l.trim()
        try {
            let q = parse_query(line)
            let count = 0
            for (let sol of run_query(q, {})) {
                count++
                console.log(sol)
            }
            console.log(count, 'results')
        } catch (e) { 
            console.error(e);
        }
        rl.prompt('> ')
    }      
}

async function main() {
    let q = parse_query('$id _metaNodeId $meta . $meta - SYS_T02 . $id name $name')
    for (let sol of run_query(q, {})) {
        console.log(`Field ${sol.$name} (${sol.$id})`);
        let q2 = parse_query(`${sol.$id} $k $v . $k name $key . $v name $value`)
        for (let sol of run_query(q2, {})) {
            console.log(`  - ${sol.$key} (${sol.$k}): ${sol.$value} (${sol.$v})`)
        }
        console.log();
    }
    console.log();
    await repl();
}

main();