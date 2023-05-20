import { render, h, VNode, ComponentChildren } from "preact"
import { Signal, signal, useSignal } from "@preact/signals";
import 'preact/devtools'; // what does this do?
import "./style.css"

const DEBUG = false

// preact seems to go off the rails on exceptions
// need a list of child nodes thing to reuse in various locations
// editable TextBlock
// elide tuples in the side bar.

// I'll want to step back and think about Self/Smalltalk

type DocType =
    | 'associatedData'
    | 'codeblock'  // a code block
    | 'hotkey'
    | 'search'
    | 'tuple'
    | 'url'
    | 'viewDef'
    | 'workspace'

type ViewType = 'table' | 'list' | 'navigation' | 'cards'

interface Node {
    id: string
    props: {
        created: number
        name?: string
        description?: string
        _metaNodeId: string
        _docType?: DocType
        _view?: ViewType
        _done?: false | number
        _editMode?: boolean
        _ownerId?: string
        _sourceId?: string
    }
    children?: string[]
    _underConstruction?: true
    associationMap?: Record<string, string> // what is this?
    modifiedTs: number[]
    touchCounts: number[]
}

interface Data {
    formatVersion: 1
    currentWorkspaceId: string // these are mostly empty and numerous
    docs: Node[]
    workspaces: Record<string, string> // json string.
    lastTxid: number
    lastFbKey: string // what is this
    optimisticTransIds: unknown[]
    editors: [string, number][]
}

type Props = Record<string, string[]>

let state = {
    nodes: signal<Record<string, Node>>({}),
    current: signal(''),
    sidebar: signal(''),
}
const getNode = (id: string) => state.nodes.value[id]

const div = (className: string, ...children: ComponentChildren[]) => h('div', { className }, ...children)

const app = {
    async initialize() {
        let res = await fetch('out.json')
        let data: Data = await res.json();
        let nodes: Record<string, Node> = {}
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
            console.log('sidebar:', sidebarId);
            // TODO - leave this out for now, to access full tree
            // current = sidebarId
        }
        let hash = window.location.hash.slice(1)
        state.current.value = nodes[hash] ? hash : current

    },
    props(nodeId: string) {
        // key value I guess
        let rval: Props = {}
        let node = getNode(nodeId)
        if (node && node.children) {
            for (let id of node.children) {
                let child = getNode(id)
                if (!child) { console.error(nodeId, 'missing child', id); continue }
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

type NodeProp = { node?: Node }

function Foldy({ toggle }: { toggle: Signal<boolean> }) {
    let right = "M10.707 17.707 16.414 12l-5.707-5.707-1.414 1.414L13.586 12l-4.293 4.293z";
    let down = "M16.293 9.293 12 13.586 7.707 9.293l-1.414 1.414L12 16.414l5.707-5.707z";
    let d = toggle.value ? down : right;
    return (
        h('button', { class: 'foldy', onClick: () => toggle.value = !toggle.value },
            h('svg', { height: '1em', width: '1em', viewBox: '0 0 24 24', stroke: 'currentColor', fill: 'currentColor' },
                h('path', { d })))
    )
}

function selectNode(name: string, id: string) {
    history.pushState({}, name, '#' + id)
    // setDB(produce(db => db.current = id))
    state.current.value = id
}

window.addEventListener('hashchange', () => {
    let hash = window.location.hash.slice(1)
    if (getNode(hash)) state.current.value = hash

})

function Bullet({ node }: NodeProp) {
    if (!node) return null
    let className = 'bullet'
    if (!node.children?.length) className += ' empty'
    let onClick = () => selectNode(node.props.name || '', node.id)
    return h('div', { class: 'bdiv' }, h('button', { className, onClick }))
}


function TupleHead({ node }: NodeProp) {
    if (!node) return null
    return h('div', { class: 'tupleHead', title: node.id }, node.props.name)
}

function Tuple(props: NodeProp) {
    let { node } = props
    if (!node || !node.children || !node.children[0]) return null
    return div('tuple', h(TupleHead, { node: getNode(node.children[0]) }),
        div('tupleTail', node.children.slice(1).map(id => h(Node, { node: getNode(id) }))))
}

function TextBlock({ node }: NodeProp) {
    if (!node) return null
    let meta = app.props(node.props._metaNodeId)
    
    let raw = node.props.name || ''
    let div
    let href : string | undefined
    if (meta.SYS_T15) {
        let fileNode = getNode(meta.SYS_T15[0])
        href = fileNode.props.name
        div = document.createElement('a')
        console.log('T15', fileNode, href)
        if (href) {
            div.setAttribute('href',href)
            div.setAttribute('target','_new')
            div.className = 'fileLink'
        }
    } else {
        div = document.createElement('span')
    }
    
    div.innerHTML = raw
    console.log('pre',div)
    let populate = (div: HTMLElement | null) => {
        console.log('populate',div)
        if (div) {
            div.innerHTML = raw
            // fix up links
            for (let span of div.querySelectorAll('span')) {
                console.log(span)
                let refid = span.getAttribute('data-inlineref-node')
                if (!refid) { console.warn('non-ref span', span); continue }
                let refNode = getNode(refid)
                if (!refNode) { console.warn('ref not found', span); continue }
                span.innerText = refNode.props.name || ''
            }
        }
    }
    let title = node.id + ' ' + (node.props._docType || '')
    if (href) {
        // Probably need a local link?
        return h('a', { ref: populate, title, href, target: '_blank', class: 'fileLink'})
    } else {
        return h('span', { ref: populate, title })
    }
    
}

function NodeLine(props: NodeProp & { toggle: Signal<boolean> }) {
    let { node, toggle } = props
    if (!node) return null
    return h('div', { class: 'nodeLine' },
        h(Foldy, { toggle }),
        h(Bullet, { node }),
        h(TextBlock, { node }),
        h(Tags, { node }))
}

function MetaData({ node }: NodeProp) {
    console.log('meta', node)
    if (!node) return null;
    return h('div', { class: 'metadata' }, node.children?.map(id => h(Node, { node: getNode(id) })))
}

function SidebarNode({ node }: NodeProp): VNode | null {
    if (!node) return null
    // FIXME - this doesn't reset when node changes, maybe I need different state.
    // or stuff the nodeid in there.
    let toggle = useSignal(node.id === state.sidebar.value)
    let onClick = () => state.current.value = node.id
    // FIXME - filter these
    let children = toggle.value && node?.children || []
    return div('sideNode',
        div('slug',
            h(Foldy, { toggle }),
            h('div', { class: 'name', onClick }, node?.props.name)),
        div('sideChildren', children.map(id => h(SidebarNode, { node: getNode(id) }))))
}

function Sidebar() {
    let node = getNode(state.sidebar.value)
    if (!node) return null
    return h('div', { class: 'sidebar' },
        // h('div',{class:'shead'},'Pinned'),
        h('div', { class: 'shead' }, 'Workspaces'),
        h(SidebarNode, { node })
    )
}

function Tags({ node }: NodeProp) {
    if (!node) return null
    let meta = app.props(node.props._metaNodeId)
    console.log('tag update', node.id)
    let tags = meta.SYS_A13 || []
    let tagNames = tags.map(tag => getNode(tag)?.props.name || tag)
    return h('span', { class: 'tags' }, tagNames.map(name => h('span', { class: 'tag' }, '#' + name)))
}

function Table({ node }: NodeProp) {
    if (!node) return null;  // FIXME these are all wrong if we're using hooks
    let meta = app.props(node.props._metaNodeId)
    let viewNode = getNode(meta.SYS_A16[0])
    let viewMeta = app.props(viewNode.id)
    let colTuples = viewMeta.SYS_A17.map(getNode)
    let colIds = colTuples.map(tuple => tuple.children?.[0] || '')
    let colDefs = colIds.map(getNode)

    let tableCell = (ids: string[] = []) => {
        let nodes = ids.map(getNode)
        return h('td', {}, nodes.map(n => h(TextBlock, { node: n })))
    }

    let tableRow = (id: string) => {
        let props = app.props(id)
        return h('tr', {},
            h('td', {}, h(Node, { node: getNode(id) })),
            colIds.map(id => tableCell(props[id])))
    }
    return h('div', {},
        h('table', {},
            h('tr', {},
                h('th', {}, 'Title'),
                colDefs.map(n => h('th', {}, n.props.name))),
            node.children?.map(tableRow)))
}
function Page({ node }: NodeProp) {
    if (!node) return null;
    let metaNode = node.props._metaNodeId ? getNode(node.props._metaNodeId) : null
    let { _docType } = node.props
    if (_docType === 'search') {
        // handle tables...
    }
    // SYS_A16
    // FIXME - we need to pass this in, so we don't rerender on the .nodes access.
    // We're essentially back to container/component here, unless we can get a signal for
    // each node. Find out how signals work, or just do a lazy create map of signals.
    let meta = app.props(node.props._metaNodeId)
    let viewType
    if (meta.SYS_A16) {
        let view = getNode(meta.SYS_A16[0])
        viewType = view.props._view
    }

    let body
    switch (viewType) {
        case 'table':
            body = h(Table, { node })
            break;
        default:
            body = node.children?.map(id => h(Node, { node: getNode(id) }))
    }
    return h('div', { class: 'page' },
        h('div', { class: 'heading' }, h(TextBlock, { node }), h(Tags, { node })),
        h('div', { class: 'page-description' }, node.props.description),
        DEBUG && metaNode && h(MetaData, { node: metaNode }),
        body)
}

function Node({ node }: NodeProp): VNode<any> | null {
    if (!node) return null;
    let toggle = useSignal(false)
    // what other types are special..
    let { _docType } = node.props
    if (_docType === 'tuple') return h(Tuple, { node })
    if (_docType === 'codeblock') return h('pre', { class: 'codeblock' }, node?.props.name)

    let metaNode = node.props._metaNodeId ? getNode(node.props._metaNodeId) : null

    return h('div', { class: 'node' },
        h(NodeLine, { node, toggle }),
        h('div', { class: 'children' },
            toggle.value && DEBUG && metaNode ? h(MetaData, { node: metaNode }) : null,
            toggle.value ? node.children?.map(id => h(Node, { node: getNode(id) })) : null
        ))
}

function App() {
    if (!state.current.value) return h('div', {}, 'Loading...')
    let currentNode = getNode(state.current.value)
    return h('div', { class: 'top' }, h(Sidebar, {}), h(Page, { node: currentNode }))
}

let el = document.getElementById('app')
if (el) {
    render(h(App, {}), el)
} else {
    window.alert('no #app element')
}

app.initialize();
