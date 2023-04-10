import { existsSync } from 'fs';
import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { resolve } from 'path';
import { DataStore } from './database'
import { decode_value } from './decode';

let sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function assert(thing: any): asserts thing is string {
    if (typeof thing !== 'string')
        throw new Error(`expected string got ${thing}`)
}


async function* getFiles(dir: string): AsyncGenerator<string> {
    const dirents = await readdir(dir, { withFileTypes: true });
    for (const dirent of dirents) {
        const res = resolve(dir, dirent.name);
        if (dirent.isDirectory()) {
            yield* getFiles(res);
        } else {
            yield res;
        }
    }
}

async function main() {
    // These are reverenced from the LevelDB
    // I have code to read chrome's LevelDB, but haven't
    // figured out the external blob references yet.
    let dn = "https_app.tana.inc_0.indexeddb.blob"
    for await (let fn of getFiles(dn)) {
        console.log(fn)
        let buf = await readFile(fn)
        let data = decode_value(buf, 15)
        console.log(fn, data.currentWorkspaceId, data.lastTxid)
        let wsid = data.docs[0].id
        console.log('wsid', wsid)

        // console.log(Object.keys(data))
        console.log(fn, data.docs.length)
        let outfn = `backup/${wsid}_${data.lastTxid}.json`
        await writeFile(outfn, JSON.stringify(data, null, '  '))
        let store = new DataStore(data)
        // Here is the shape of it. There is no differentiation
        // that I can find between a link and an uploaded file.
        // So we'll use heuristics on the url.
        // And I guess for now, node id for filename?

        // Queries are expensive without an index...
        let results = store.query(`
    $meta SYS_T15 $v .
    $node _metaNodeId $meta .
    $v name $url .
    $node name $name
    `)
        if (wsid === 'drT7__5gJr') {
            // write latest to dist
            await writeFile('dist/out.json', JSON.stringify(data, null, '  '))

            // get files
            for (let sol of results) {
                // console.log(sol)
                let { $node, $name, $url } = sol
                assert($url)
                console.log('*', $name)
                await mkdir(`backup/${wsid}`, { recursive: true })
                if ($url.includes('firebasestorage')) {
                    let fn = `backup/${wsid}/${$node}`
                    if (existsSync(fn)) continue
                    console.log('fetch', fn, 'from', $url)
                    let rval = await fetch($url)
                    let res = await rval.arrayBuffer()
                    await writeFile(fn, new DataView(res))
                    await sleep(1000)
                }
            }
        }
    }
}

main();
