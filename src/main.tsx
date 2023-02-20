

import { render, h } from "preact"
import { signal, useComputed } from "@preact/signals";
import 'preact/devtools'; // what does this do?
import "./style.css"
// @jsx h
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

// Trying preact + signal

const s_nodes = signal<Record<string,Node>>({});
const s_unfold = signal<Record<string,boolean>>({});
const s_current = signal('');

function toggle(path: string) {
    console.log('toggle',path)
    s_unfold.value = {...s_unfold.value, [path]: !s_unfold.value[path]}
    console.log('toggle',path, s_unfold.value[path])
}


type NodeProp = {node?: Node, path: string}

function Foldy({node,path}: NodeProp) {
    if (!node) return null;   
    let right = "M10.707 17.707 16.414 12l-5.707-5.707-1.414 1.414L13.586 12l-4.293 4.293z";
    let down = "M16.293 9.293 12 13.586 7.707 9.293l-1.414 1.414L12 16.414l5.707-5.707z";
    // return h('button', {class: 'foldy', onClick: () => toggle(path)}, 
    //             h('svg', {height: '1em', width: '1em', viewBox: '0 0 24 24', fill: 'currentColor'},
    //                 h('path',{d: unfold.value[path]?down:right})))
    return <button class="foldy" onClick={() => toggle(path)}>
        <svg height="1em" width="1em" viewBox="0 0 24 24" stroke="currentColor" fill="currentColor">
            <path d={s_unfold.value[path]?down:right}/>
        </svg>
        </button>
}

function selectNode(name: string, id: string) {
    // history.pushState({},name,'#'+id)
    // setDB(produce(db => db.current = id))
    s_current.value = id
}

function Bullet({node}: NodeProp) {
    if (!node) return null
    let className = 'bullet'
    if (!node.children?.length) className += ' empty'
    return <div class="bdiv"><button class={className} onClick={() => selectNode(node.props.name||'', node.id)}></button></div>
}


function TupleHead({node}: NodeProp) {
    if (!node) return null
    return h('div',{class:'tupleHead'}, node.props.name, h('small',{class:'ident'}, node.id))
}
function Tuple(props: NodeProp) {
    let {node,path} = props
    if (!node || !node.children || !node.children[0]) return null
    
    return (
        <div class='tuple'>
            <TupleHead node={s_nodes.value[node.children[0]]} path={path}></TupleHead>
            <div class='tupleTail'>
                <div>{node.children.join(', ')}</div>
                {node.children.slice(1).map(id => <Node node={s_nodes.value[id]} path={path}/>)}
            </div>
        </div>
    )
}

function NodeLine(props: NodeProp) {
    let {node,path} = props
    if (!node) return null
    
    

    return (
    <div class="nodeLine">
        <Foldy node={node} path={path} /><Bullet node={node} path={path} />
        <div>{node.props.name} {node.props._docType ? <span class='doctype'>{node.props._docType}</span> :void 0} <small class='ident'>{node.id}</small></div>
    </div>
    );
}

function MetaData({node,path}: NodeProp) {
    console.log('meta', node)
    if (!node) return null;
    return (
        <div class='metadata'>
            {node.children?.map(id => <Node node={s_nodes.value[id]} path={path} />)}
        </div>
    )
}

function Page({node,path}: NodeProp) {
    if (!node) return null;
    return (<div class="page">
        <div class="heading"><NodeLine node={node} path={path}/></div>
        <div>Todo: description, etc</div>
        {node.children?.map(id => <Node node={s_nodes.value[id]} path={path} /> )}
    </div>)
}

function Node({node,path}: NodeProp) {
    if (!node) return null;
    let id = node.id;
    path = path + '/' + node.id;
    
    if (node.props._docType === 'tuple') return <Tuple node={node} path={path}/>

    // this suffices to avoid re-renders.
    let unfolded = useComputed(() => !!s_unfold.value[path]).value
    
    console.log('render',id, path, unfolded)
    
    return (
        
    <div>
        <NodeLine node={node} path={path}/>
        <div class="children">
            <pre>{JSON.stringify(node.props)}</pre>
            {unfolded ? <MetaData node={s_nodes.value[node.props._metaNodeId]} path={path}/> : null }
            {unfolded ? node.children?.map(id => <Node node={s_nodes.value[id]} path={path}/>) : null }
        </div>
    </div>)
}

function App() {
    if (!s_current.value) return <div>Loading...</div>

    return (
        <div>
        <h2>Heading</h2>
        <div><Node path={s_current.value} node={s_nodes.value[s_current.value]} /></div>
    </div>
    )
    
}

let el = document.getElementById('app')
if (el) {
    render(<App />, el)
} else {
    window.alert('no #app element')
}

async function initialize() {
    let res = await fetch('out.json')
    let data = await res.json();
    console.log(data);
    
    let rootId = data.docs[0].id
    
    let tmp: Record<string,Node> = {}
    for (let node of data.docs) {
        tmp[node.id] = node
    }
    s_nodes.value = tmp
    
    let hash = window.location.hash.slice(1)
    s_current.value = tmp[hash] ? hash : rootId;
}
initialize();
