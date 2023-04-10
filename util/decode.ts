import { readdir, readFile } from 'fs/promises'
import { resolve } from 'path'

// Decode v8 data
// third_party/blink/renderer/modules/indexeddb/idb_value_wrapping.h
// SerializedScriptValue
// https://chromium.googlesource.com/chromium/blink/+/master/Source/bindings/core/v8/SerializedScriptValue.cpp
// SerializationTag.h
// https://chromium.googlesource.com/chromium/blink/+/master/Source/bindings/core/v8/SerializationTag.h


export
    function decode_value(data: Uint8Array, p: number) {
    let ostack: any[] = []
    let stack: any[] = []
    let rtable: any[] = []

    function uvarint() {
        let x = 0, s = 0
        for (; ;) {
            let b = data[p++]
            x = x | ((b & 127) << s)
            s += 7
            if (b < 128) return x
        }
    }

    // is this really latin1?
    const latin1 = new TextDecoder('latin1')
    const utf16 = new TextDecoder('utf-16le')
    function read_bytes() {
        let l = uvarint()
        let v = data.slice(p, p + l)
        p += l

        return v
    }
    function read_double() {
        let v = new DataView(data.buffer).getFloat64(p, true)
        p += 8
        return v
    }

    while (p < data.byteLength) {
        let tag = data[p]
        p += 1
        if (tag == 0) { // padding tag

        } else if (tag == 111) { // o fresh obj
            let o = {}
            ostack.push(o)
            rtable.push(o)
        } else if (tag == 34) { // " string?
            let s = read_bytes()
            stack.push(latin1.decode(s))
        } else if (tag == 73) { // I int32
            let v = uvarint()
            if (v & 1) {
                stack.push(-1 - (v >> 1))
            } else {
                stack.push(v >> 1)
            }
        } else if (tag == 97 || tag == 65) { // a sparse array  A dense array
            let l = uvarint() // REVIEW
            let o: any[] = []
            ostack.push(o)
            rtable.push(o)
        } else if (tag == 64) { // @ close sparse array
            let np = uvarint()
            let l = uvarint()
            let a = ostack.pop()
            while (np > 0) {
                let v = stack.pop()
                let i = stack.pop()
                np = np - 1
                while (a.length <= i) { a.push(null) }
                a[i] = v
            }
            stack.push(a)
        } else if (tag == 36) { //   $ close dense array
            let np = uvarint()
            let l = uvarint()
            if (np && l) {
                console.log('aclose', np, l, stack)
                throw new Error("FIXME")
            }
            let a = ostack.pop()
            while (l > 0) {
                a.push(stack.pop())
                l -= 1
            }
            a.reverse()
            while (np > 0) {
                let v = stack.pop()
                let i = stack.pop()
                np = np - 1
                while (a.length <= i) { a.push(null) }
                a[i] = v
            }
            stack.push(a)
        } else if (tag == 123) { // { close object
            let np = uvarint()
            let o = ostack.pop()
            while (np > 0) {
                let v = stack.pop()
                let k = stack.pop()
                np = np - 1
                o[k] = v
            }
            stack.push(o)
        } else if (tag == 78) { // N double
            stack.push(read_double())
        } else if (tag == 84) {
            stack.push(true)  // T true
        } else if (tag == 70) {
            stack.push(false) // F false
        } else if (tag == 99) { // c raw unicode
            let v = utf16.decode(read_bytes())
            stack.push(v)
        } else if (tag == 94) { // ^ ref
            let ref = uvarint()
            // console.log('ref', rtable, ref)
            stack.push(rtable[ref])
        } else if (tag == 68) { // D date
            let v = new Date(read_double())
            stack.push(v)
            rtable.push(v)
        } else if (tag == 95) { // _ undefined
            stack.push(null)
        } else if (tag == 48) { // 0 null
            stack.push(null)
        } else if (tag == 255) { // Version
            let v = uvarint()
            // console.log("VERSION", v)
        } else {
            throw new Error(`Unknown tag ${tag} at ${p}`)
        }
    }
    return stack[0]
}
