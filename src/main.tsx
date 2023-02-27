// @jsx h

import { render, h } from "preact"
import { Signal, signal, useSignal } from "@preact/signals";
import 'preact/devtools'; // what does this do?
import "./style.css"

// This is all screwed up because I'm 

// still soem weird issues with toggles
// seem to not work when drilled down.

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

interface Data {
    formatVersion: 1
    currentWorkspaceId: string // these are mostly empty and numerous
    docs: Node[]
    workspaces: Record<string,string> // json string.
    lastTxid: number
    lastFbKey: string // what is this
    optimisticTransIds: unknown[]
    editors: [string,number][]
}

let state = {
    nodes: signal<Record<string,Node>>({}),
    current: signal(''),
    sidebar: signal(''),
}

type Props = Record<string, string[]>

const app = {
    async initialize() {
        let res = await fetch('out.json')
        let data: Data = await res.json();
        let nodes: Record<string,Node> = {}
        data.docs.forEach(node => nodes[node.id] = node)
        for (let node of data.docs) {
            nodes[node.id] = node
        }
        state.nodes.value = nodes
        let rootId = data.docs[0].id
        let current = rootId
        let rootNode = nodes[rootId]
        let sidebarId = rootNode.children?.[0]
        if (sidebarId) {
            state.sidebar.value = sidebarId;
            console.log('sidebar:',sidebarId);
            // TODO - leave this out for now, to access full tree
            // current = sidebarId
        }
        let hash = window.location.hash.slice(1)
        state.current.value = nodes[hash] ? hash : current

    },
    props(nodeId: string) {
        // key value I guess
        let rval : Props = {}
        let node = state.nodes.value[nodeId]
        if (node && node.children) {
            for (let id of node.children) {
                let child = state.nodes.value[id]
                if (!child) { console.error(nodeId, 'missing child', id); continue}
                if (child.props._docType !== 'tuple') continue
                if (child.children?.length) {
                    // FIXME - probably should extend existing
                    rval[child.children[0]] = child.children.slice(1)
                }
            }
        }
        return rval
    },
    nodeTags(nodeId: string) {
        
    },
}

type NodeProp = {node?: Node}

function Foldy({toggle}: {toggle: Signal<boolean>}) {
    let right = "M10.707 17.707 16.414 12l-5.707-5.707-1.414 1.414L13.586 12l-4.293 4.293z";
    let down = "M16.293 9.293 12 13.586 7.707 9.293l-1.414 1.414L12 16.414l5.707-5.707z";
    return <button class="foldy" onClick={() => toggle.value = !toggle.value}>
        <svg height="1em" width="1em" viewBox="0 0 24 24" stroke="currentColor" fill="currentColor">
            <path d={toggle.value?down:right}/>
        </svg>
        </button>
}

function selectNode(name: string, id: string) {
    history.pushState({},name,'#'+id)
    // setDB(produce(db => db.current = id))
    state.current.value = id
}

window.addEventListener('hashchange', () => {
    let hash = window.location.hash.slice(1)
    if (state.nodes.value[hash]) state.current.value = hash

})

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
    let {node} = props
    if (!node || !node.children || !node.children[0]) return null
    return (
        <div class='tuple'>
            <TupleHead node={state.nodes.value[node.children[0]]} ></TupleHead>
            <div class='tupleTail'>
                {/* <div>{node.children.join(', ')}</div> */}
                {node.children.slice(1).map(id => <Node node={state.nodes.value[id]}/>)}
            </div>
        </div>
    )
}

function TextBlock({node}: NodeProp) {
    if (!node) return null
    let raw = node.props.name || ''
    let div = document.createElement('span')
    
    
    let populate = (div: HTMLElement|null) => {
        if (div) {
            div.innerHTML = raw
            // fix up links
            for (let span of div.querySelectorAll('span')) {
                console.log(span)
                let refid = span.getAttribute('data-inlineref-node')
                if (!refid) { console.warn('non-ref span', span); continue }
                let refNode = state.nodes.value[refid]
                if (!refNode) { console.warn('ref not found', span); continue }
                span.innerText = refNode.props.name || ''
            }
        }
    }
    return (
        <span ref={populate}>{div}</span>
    )
}

function NodeLine(props: NodeProp & {toggle: Signal<boolean>}) {
    let {node,toggle} = props
    if (!node) return null
    return (
    <div class="nodeLine">
        <Foldy toggle={toggle}/><Bullet node={node} />
        <div><TextBlock node={node}/> {node.props._docType ? <span class='doctype'>{node.props._docType}</span> :void 0} <small class='ident'>{node.id}</small></div>
        <Tags node={node}/>
    </div>
    );
}

function MetaData({node}: NodeProp) {
    console.log('meta', node)
    if (!node) return null;
    return (
        <div class='metadata'>
            {node.children?.map(id => <Node node={state.nodes.value[id]} />)}
        </div>
    )
}

function SidebarNode({node}: NodeProp) {
    if (!node) return null
    // FIXME - this doesn't reset when node changes, maybe I need different state.
    // or stuff the nodeid in there.
    let toggle = useSignal(false)
    let select = () => state.current.value = node.id
    // FIXME - filter these
    return (
        <div className="sideNode">
            <div className="slug"><Foldy toggle={toggle}/><div className="name" onClick={select}>{node?.props.name}</div></div>
            <div className="sideChildren">
                {toggle.value?node?.children?.map(id => <SidebarNode node={state.nodes.value[id]}/>):null }
            </div>
        </div>
    )
}

function Sidebar() {
    let node = state.nodes.value[state.sidebar.value]
    if (!node) return null
    return (
        <div className="sidebar">
            <div className="shead">Pinned</div>
            <div className="shead">Workspaces</div>
            <SidebarNode node={node}/>
        </div>
    )
}

function Tags({node}: NodeProp) {
    if (!node) return null
    let meta = app.props(node.props._metaNodeId)
    console.log('tag update', node.id)
    let tags = meta.SYS_A13 || []
    let tagNames = tags.map(tag => state.nodes.value[tag].props.name)
    return (
        <span class='tags'>
            {tagNames.map(name => <span class='tag'>{'#'+name}</span>)}
        </span>
    )
}

function Page({node}: NodeProp) {
    if (!node) return null;
    let metaNode = node.props._metaNodeId ? state.nodes.value[node.props._metaNodeId] : null
    let {_docType} = node.props
    if (_docType === 'search') {
        // handle tables...
    }

    return (<div class="page">
        <div class="heading">
            <span class='name'>{node.props.name}</span>
            {node.props._docType ? <span class='doctype'> {node.props._docType}</span> :void 0} 
            <Tags node={node}/>
            <small class='ident'>{node.id}</small></div>

        <div>Todo: description, etc</div>
        {metaNode && <MetaData node={metaNode}/>}
        {node.children?.map(id => <Node node={state.nodes.value[id]} /> )}
    </div>)
}

function Node({node}: NodeProp) {
    if (!node) return null;
    let toggle = useSignal(false)
    // what other types are special..
    let {_docType} = node.props
    if (_docType === 'tuple') return <Tuple node={node}/>
    if (_docType === 'codeblock') return <pre class='codeblock'>{node?.props.name}</pre>

    let metaNode = node.props._metaNodeId ? state.nodes.value[node.props._metaNodeId] : null
    
    return (
        <div class='node'>
            <NodeLine node={node} toggle={toggle}/>
            <div class="children">
                {toggle.value && metaNode ? <MetaData node={metaNode}/> : null }
                {toggle.value ? node.children?.map(id => <Node node={state.nodes.value[id]}/>) : null }
            </div>
        </div>
    )
}

function App() {
    if (!state.current.value) return <div>Loading...</div>    
    let currentNode = state.nodes.value[state.current.value]


    return (
        <div class='top'>
            <Sidebar/>
            <Page node={currentNode}/>
        </div>
    )
    
}

let el = document.getElementById('app')
if (el) {
    render(<App />, el)
} else {
    window.alert('no #app element')
}


app.initialize();
