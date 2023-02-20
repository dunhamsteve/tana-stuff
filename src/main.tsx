import { render } from "solid-js/web"
import { createStore, produce } from "solid-js/store"
import { createSignal, createEffect, Show, createContext, For } from "solid-js"

import "./style.css"

// can't use h, can't use scheme. need to write my own solidjs with macros. Or preact with signals.

interface Node {
    id: string
    props: {
        created: number
        name?: string
        _metaNodeId: string
        _docType?: string
    }   
    children?: string[] 
}
interface DB {
    rootId: string
    nodes: Record<string,Node>
    unfold: Record<string,boolean>
    current: string
}

let emptyDB: DB = {rootId: '', current: '', nodes: {}, unfold: {}}

const [db, setDB] = createStore<DB>(emptyDB);

type NodeProp = {node?: Node, path: string}

function Foldy({node,path}: NodeProp) {
    if (!node) return undefined
    let id = node.id
    let toggle = () => {
        console.log('toggle', id, db.unfold[path])
        setDB("unfold",path,!db.unfold[path])
        // setDB(produce(db => db.unfold[path] = !db.unfold[path]))
    }
    let right = "M10.707 17.707 16.414 12l-5.707-5.707-1.414 1.414L13.586 12l-4.293 4.293z";
    let down = "M16.293 9.293 12 13.586 7.707 9.293l-1.414 1.414L12 16.414l5.707-5.707z";
    return <button class="foldy" onclick={toggle}>
        <svg height="1em" width="1em" viewBox="0 0 24 24" stroke="currentColor" fill="currentColor">
            <path d={db.unfold[path]?down:right}/>
        </svg>
        </button>
}

function selectNode(name: string, id: string) {
    // history.pushState({},name,'#'+id)
    // setDB(produce(db => db.current = id))
    setDB("current", id)
    console.log('selected', db.current, id)
    console.log(db.nodes[db.current])
}

function Bullet({node}: NodeProp) {
    if (!node) return
    let empty = !!node.children?.length
    return <div class="bdiv"><button classList={{bullet:true, empty}} onClick={() => selectNode(node.props.name||'', node.id)}></button></div>
}

function TupleHead({node}: NodeProp) {
    if (!node) return
    return (
        <div class='tupleHead'>
            {node.props.name} <small class='ident'>{node.id}</small>
        </div>
    )
}
function Tuple(props: NodeProp) {
    let {node,path} = props
    if (!node || !node.children || !node.children[0]) return
    
    return (
        <div class='tuple'>
            <TupleHead node={db.nodes[node.children[0]]} path={path}></TupleHead>
            <div class='tupleTail'>
                <div>{node.children.join(', ')}</div>
                <For each={node.children.slice(1)}>{(id: string) => 
                    <Node node={db.nodes[id]} path={path}/>
                }</For>
            </div>
        </div>
    )
}

function NodeLine(props: NodeProp) {
    let {node,path} = props
    if (!node) return
    
    

    return (
    <div class="nodeLine">
        <Foldy node={node} path={path} /><Bullet node={node} path={path} />
        <div>{node.props.name} <Show when="node.props._docType"><span class='doctype'>{node.props._docType}</span> </Show><small class='ident'>{node.id}</small></div>
    </div>
    );
}

function MetaData({node,path}: NodeProp) {
    console.log('meta', node)
    if (!node) return
    return (
        <div class='metadata'>
            <For each={node.children}>{(id: string) => <Node node={db.nodes[id]} path={path} />}</For>
        </div>
    )
}

function Page({node,path}: NodeProp) {
    if (!node) return;
    return (<div class="page">
        <div class="heading"><NodeLine node={node} path={path}/></div>
        <div>Todo: description, etc</div>
        <For each={node.children}>{(id: string) => <Node node={db.nodes[id]} path={path} />}</For>
    </div>)
}

function Node({node,path}: NodeProp) {
    if (!node) return;
    let id = node.id;
    path = path + '/' + node.id;
    
    if (node.props._docType === 'tuple') return <Tuple node={node} path={path}/>

    console.log('render',id)
    return (
        
    <div>
        <NodeLine node={node} path={path}/>
        <div class="children">
            <pre>{JSON.stringify(node.props)}</pre>
            <Show when={db.unfold[path]}>
                <Show when={node.props._metaNodeId}><MetaData node={db.nodes[node.props._metaNodeId]} path={path}/></Show>
                <For each={node.children}>{(id: string) => <Node node={db.nodes[id]} path={path}/>}</For>
            </Show>
        </div>
    </div>)
}

function App2(props: {}) {
    return  <div><Node path={db.current} node={db.nodes[db.current]} /></div>
}

function App() {
    createEffect(async () => {
        let res = await fetch('out.json')
        let data = await res.json();
        console.log(data);
        
        let rootId = data.docs[0].id
        let current = rootId
        
        let db: DB = {rootId, nodes: {}, unfold: {}, current}
        for (let node of data.docs) {
            db.nodes[node.id] = node
        }
        current = window.location.hash.slice(1)
        if (db.nodes[current]) db.current = current
        setDB(db)
    })
    // I think we need something else here.
    return <Show when={db.rootId} fallback={<div>Loading</div>}>
            <div>
                <h2>Heading</h2>
                <App2/>
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
