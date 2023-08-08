import {readFileSync} from 'fs'
import {Database, DataStore} from './database'
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



let data: Database = JSON.parse(readFileSync('www/out.json','utf8'))

let store = new DataStore(data)


const readline = require('readline');
async function repl() {
    console.log(`REPL

query language a series of triples separated by '.' values in the triple are one of:
- literal value like SYS_A13
- variable like $e
- wildcard -

examples:

- SYS_A13 $e . $e name $name
$meta SYS_A13 SYS_T01 . $e _metaNodeId $meta . $e name $name

`)
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
    rl.prompt('> ')
    for await (let l of rl) {
        let line: string = l.trim()
        try {
            let count = 0
            for (let sol of store.query(line)) {
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
    await repl();
}

main();
