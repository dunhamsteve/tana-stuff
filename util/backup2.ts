import { existsSync, readdirSync, statSync } from 'fs';
import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { join, resolve } from 'path';
import {homedir} from "node:os";
import { DataStore } from './database'
import { decode_file } from './decode_ffox';

let sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function assert(thing: any): asserts thing is string {
    if (typeof thing !== 'string')
        throw new Error(`expected string got ${thing}`)
}

function* walk(root: string): Generator<string> {
    for (let name of readdirSync(root)) {
        let fn = join(root, name)
        let st = statSync(fn)
        if (st.isDirectory()) {
            yield *walk(fn)
        } else {
            yield fn
        }
    }
    
}

async function main() {
    let home = homedir();
    let root = `${home}/Library/Application Support/Firefox/Profiles`
    for await (let fn of walk(root)) {
        if (!fn.match('app.tana.inc.*files')) continue
        console.log(fn)
        let buf = await readFile(fn)
        let data = decode_file(buf)
        console.log(fn, data.currentWorkspaceId, data.lastTxid)
        let wsid = data.docs[0].id
        console.log('wsid', wsid)
        console.log(fn, data.docs.length)
        let outfn = `backup/${wsid}_${data.lastTxid}.json`
        await writeFile(outfn, JSON.stringify(data, null, '  '))
        // Only backup files from my main store.
        if (wsid === 'drT7__5gJr') {
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
            // write latest to dist
            await writeFile('www/out.json', JSON.stringify(data, null, '  '))
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
