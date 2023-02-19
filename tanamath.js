// ==UserScript==
// @name         Tana Math
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  try to take over the world!
// @author       You
// @match        https://app.tana.inc/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=tana.inc
// @grant        GM_addElement
// ==/UserScript==

(function() {
    'use strict';
GM_addElement('link', {rel: 'stylesheet', href: 'https://cdn.jsdelivr.net/npm/katex@0.16.4/dist/katex.css'});
let kt = GM_addElement('script',{src: 'https://cdn.jsdelivr.net/npm/katex@0.16.4/dist/katex.js'});
    // figure out how to get this to load second. It's not seeing katex or something.
setTimeout(() => GM_addElement('script',{src:'https://cdn.jsdelivr.net/npm/katex@0.16.4/dist/contrib/auto-render.js'}), 2000)

    let CONFIG = {delimiters:[{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false}],throwOnError:false};

function focusNode(ev) {
    // On focus, we swap React's html back in.
    // But we need a safety net to be sure it hasn't been
    // re-rendered by react since we last saved html.
    console.log('focus',ev);
    let node = ev.target
    if (!node.$html) {
        console.log('focused with no html?', node, node.$html)
        return
    }
    if (node.innerHTML !== node.$rendered) {
        // Maybe we can peel the node id from somewhere?
        console.log('content changed by react')
        console.log('render', node.$rendered)
        console.log('new value', node.innerHTML)
    } else {
        node.innerHTML = node.$html
    }
    node.$state = 'focus'
    delete node.$html
}

function blurNode(ev) {
    // On blur, we save the html and do katex rendering.
    // Later we'll have our own renderMathInElement, and only do the dance for mathy nodes. (or just check for $)
    console.log('blur',ev);
    let node = ev.target;
    // save React's html
    node.$html = node.innerHTML;
    node.$state = 'blur';
    console.log('set', node, node.$html, node.$state);

    // TODO - maybe just do this manually instead of auto-render
    renderMathInElement(node, CONFIG);
    // We keep a copy of this, too.  If it doesn't match, react has changed the model and we don't want to
    // focus
    node.$rendered = node.innerHTML
}

function hookNode(target) {
    if (!target.$hooked) {
        let active = document.activeElement == target;
        console.log('hook', target, 'active', active);
        target.addEventListener('blur', blurNode);
        target.addEventListener('focus', focusNode);
        active ? focusNode({target}) : blurNode({target});
        target.$hooked = true
    } else {
        // TODO - refresh state - this will be called when we detect dom changes and
        // want to get the math rendered again.  The safety nets above should keep
        // text from migrating between nodes
    }
}

function makeItSo() {
    let nodes = document.querySelectorAll('span.editable');
    [...nodes].forEach(hookNode);
}

window.makeItSo = makeItSo

})();