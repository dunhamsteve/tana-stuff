import { Tuple } from "./types";

export function assert(value:unknown, msg: string = 'assert'): asserts value {  if (!value) throw new Error("Assert failed: "+msg); }
export let jlog = (x:any) => console.log(JSON.stringify(x,null,'  '))

export function tupleCmp(needle: Tuple, tuple:Tuple) {
    for (let i=0;i<needle.length;i++) {
        if (needle[i]! < tuple[i]!) return -1
        if (needle[i]! > tuple[i]!) return 1
    }
    return 0
}

export function search(n: number, fn: (ix:number) => boolean) {
    let i = 0, j = n
    while (i < j) {
        let h = (i + j)>>1
        if (!fn(h)) {
            i = h + 1
        } else {
            j = h
        }
    }
    return i
}


// Not used at the moment

class Sym extends String {}
export function $(s: string) { return new Sym(s) }


export function match(pat: any, item: any) {
    let env: any = {}
    function go(pat: any, item: any) {
        if (pat === undefined) return true // wildcard
        if (pat == null) { // do we need null matching or can this be wildcard?
            if (item != pat) return false
        } else if (pat instanceof Sym) {
            env[pat.toString()] = item
        } else if (pat instanceof Array) {
            for (let i=0;i<pat.length;i++) {
                if (!go(pat[i], item[i])) return false
            }
        } else if (typeof pat == 'function') {
            if (!pat(item)) return false
        } else if (typeof pat == "object") {
            for (let k in pat) {
                if (!go(pat[k], item[k])) return false
            }
        } else if (item != pat) {
            return false
        }
        return true
    }
    return go(pat,item)?env:undefined
}