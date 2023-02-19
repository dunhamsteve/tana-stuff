import { render } from "solid-js/web"
import { createStore, produce } from "solid-js/store"
import { createSignal, createEffect, Show, createContext, For } from "solid-js"

import "./style.css"

// fixme
type Node = any

interface DB {
    rootId: string
    current: string
    nodes: Record<string,Node>
    unfold: Record<string,boolean>
}

let emptyDB: DB = {rootId: '', current: '', nodes: {}, unfold: {}}


const [db, setDB] = createStore<DB>(emptyDB);

function Foldy({id}: {id: string}) {
    let toggle = () => {
        console.log('toggle', arguments, db.unfold[id])
        setDB(produce(db => db.unfold[id] = !db.unfold[id]))
    }
    
    return <span onclick={toggle}>{db.unfold[id] ? "▼" : "▶"}</span>
}


function selectNode(id: string) {
    setDB(produce(db => {db.current = id}))
}

function Node({id}: {id: string}) {
        


    console.log('render',id)
    return (
        <Show when={db.nodes[id]} fallback="Node not found">
    <div>
        <div><Foldy id={id} /><b>{db.nodes[id].props.name}</b><small class='ident'>{id}</small></div>
        <pre>{JSON.stringify(db.nodes[id].props)}</pre>
        <div class="children">
            <Show when={db.unfold[id]}>
                <For each={db.nodes[id].children}>{(id: string) => <Node id={id} />}</For>
            </Show>
        </div>

        </div></Show>)
}

function Page({id}: {id: string}) {
    return (
        <div/>
    )
}


function App() {
    createEffect(async () => {
        let res = await fetch('out.json')
        let data = await res.json();
        console.log(data);
        
        let rootId = data.docs[0].id
        let db: DB = {rootId, nodes: {}, unfold: {}}
        for (let node of data.docs) {
            db.nodes[node.id] = node
        }
        setDB(db)
    })
    // I think we need something else here.
    return <Show when={db.rootId} fallback={<div>Loading</div>}>
            <div>
                <h2>Heading</h2>
                <Node id={db.rootId}/>
            </div>
    </Show>
    // does firacode have bananas? (| |)
}

let el = document.getElementById('app')
if (el) {
    render(() => <App />, el)
} else {
    window.alert('no #app element')
}
