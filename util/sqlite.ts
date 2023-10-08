// This reads sqlite files and dump tables as json.
// Search, index, and write support are not implemented.
// This is coded for nodejs Buffer and needs to be adjusted for ArrayBuffer/DataView

import { tokenize } from './parser'
import { Schema, Tuple, Value, Node } from './types'
import { assert, search, tupleCmp } from './util'

let td = new TextDecoder()

let debug = console.log
debug = x => x

// slice for a DataView
function sliceView(view: DataView, start: number, end: number) {
    return new DataView(view.buffer, view.byteOffset+start, end-start);
}

// copy for a DataView
function copyView(dest: DataView, doff: number, source: DataView, soff: number, len: number) {
    for (let i = 0; i< len; i++) {
        dest.setUint8(doff+i, source.getUint8(soff+i));
    }
}

// extracts column names and pk/rowid info out of create table ddl
export function parse(page: number, sql: string): Schema {
    const toks = tokenize(sql)
    debug(toks)
    let s = 0
    let columns:string[] = []
    let name = ''
    let rowid = true
    let pks: string[] = []
    let prev =''
    let idcol
    let table = false
    // this is getting hairy..
    for (let t of toks) {
        let x = s+t
             if (x=='0(') s = 1
        else if (x=='0table') table = true
        else if (x=='1primary') s = 3
        else if (x=='1constraint') s = 6
        else if (x=='6primary') s = 3
        else if (x=='3(') s=4
        else if (x=='4,') {}
        else if (x=='4)') s=2
        else if (x=='2(') s=5 // paren in column line
        else if (x=='5)') s=2
        else if (x=='2)') s=0
        else if (x=='2primary') { pks.push(name); if (prev=='integer') idcol=name }
        else if (x=='1,'||x=='2,') s=1
        else if (x=='0without') rowid=false
        else if (s==1) { if (t != 'foreign') columns.push(name=t); s=2 }
        else if (s==4) pks.push(t)
        // else console.log(`skip "${x}"`)
        prev = t
    }
    // move pks to front for without rowid case (to match the table on disk)
    if (!rowid) {
        columns = pks.concat(columns.filter(x => !pks.includes(x)))
    } else if (table) {
        // we have rowid as column 0 otherwise
        columns.unshift('rowid')
    }
    return {page,columns,pks,rowid,idcol,indexes:[]}
}

export class Database {
    data: DataView
    pageSize: number
    encoding: number
    reserved: number
    tables: Record<string,Schema>
    constructor(buffer: ArrayBuffer) {
        let data = new DataView(buffer);
        this.data = data;

        let magic = td.decode(sliceView(data,0,16));
        assert('SQLite format 3\u0000' == magic, "Bad header magic");
        this.pageSize = data.getUint8(16)*256+data.getUint8(17)*65536;
        this.encoding = data.getUint32(56);
        assert(this.encoding == 1, 'only utf8 is supported');

        // This is extra space in each page for stuff like encryption
        this.reserved = data.getUint8(20); assert(this.reserved == 0, "reserved not implemented");
        this.tables = {
            sqlite_master: {
                page: 1,
                columns: ['rowid', 'type', 'name', 'tbl_name', 'rootpage', 'sql'],
                indexes: [],
                pks: [],
                rowid: true,
            }
        }
        for (let row of this.seek(1,[])) {
            let [_rowid,type,name,_table,page,sql] = row as any;
            debug({type,name})
            if (type == 'table') {
                let table = this.tables[name] = parse(page, sql)
                if (table.rowid) {
                    table.indexes.push({
                        name,
                        type: 'rowid',
                        page: table.page,
                        // only the first is actually in order
                        ixcols: 1,
                        columns: table.columns,
                    })
                } else {
                    // FIXME - table is an index of pks/col
                }
            }
        }
        for (let row of this.seek(1,[])) {
            let [rowid, type,name,table,page,sql] = row as any;
            if (type !== 'index') continue
            let t = this.tables[table]
            if (!t) {
                console.error(`no table ${table} for index ${name}`)
                continue
            }
            // see also unique keys.. Probably have to do this in the create table parser
            let m = name.match(/sqlite_autoindex_(.*)_1/)
            if (sql) {
                let {columns} = parse(page,sql)
                let ixcols = columns.length
                // FIXME - wrong for without rowid tables
                columns = columns.concat(t.rowid?['rowid']:t.pks)
                t.indexes.push({name, type, page, columns, ixcols})
            } else if (m) {
                let ixcols = t.pks.length
                t.indexes.push({name, type, page, columns: t.pks.concat(['rowid']), ixcols})
            } else {
                // console.error('stray index with no sql', name)
            }
        }
    }

    getPage(number: number) {
        return new DataView(this.data.buffer, (number-1)*this.pageSize, this.pageSize);
    }
    // Get btree node for page i
    getNode(i: number) {
        let data = this.getPage(i)
        let start = i == 1 ? 100 : 0
        let type = data.getUint8(start);
        let nCells = data.getUint16(start+3);
        let cellStart = data.getUint16(start+5);
        let right = data.getUint32(start+8); // only valid for types 2,5
        return { type, data, start, nCells, cellStart, right }
    }

    // return a cursor at key (or node that would follow key) where key is a prefix of the cell tuples
    // do we want a separate one for rowid?
    // this is for searching an index or materialized view (without rowid tables)
    // generator will be our "cursor"
    *seek(i: number, needle: Value[]): Generator<Value[]>  {
        // Find start
        let stack: [Node,number][]  = []
        let node = this.getNode(i)
        let tuple = (ix:number) => this.getTuple(node,ix)
        let getChild = (ix: number) => {
            assert(node.type<8, 'got child of leaf?')
            let ptrPos = ix < node.nCells ? node.data.getUint32(node.data.getUint16(node.start + 12 + 2*ix)) : node.right
            return this.getNode(ptrPos)
        }
        // Seach for first spot <= needle
        let ix: number
        for (;;) {
            ix = search(node.nCells, (i) => tupleCmp(needle, tuple(i))<1)
            if (node.type&8) break // leaf
            stack.push([node,ix])
            node = getChild(ix)
        }

        for (;;) {
            if (ix <= node.nCells) {
                if (node.type&8) { // leaf
                    if (ix < node.nCells) yield tuple(ix)
                    ix++
                } else {
                    stack.push([node,ix])
                    node = getChild(ix)
                    ix = 0
                }
            } else {
                // past end -> pop
                // emit the tuple if appropriate and increment ix
                let t = stack.pop()
                if (!t) return
                node = t[0]
                ix = t[1]
                if (ix < node.nCells && node.type != 5)
                    yield tuple(ix)
                ix++
            }
        }
    }

    getTuple(page: Node, i: number): Tuple {
        let ptr = page.start + ((page.type<8)?12:8);
        let data = page.data;
        let pos = data.getUint16(ptr+2*i);
        let type = page.type

        function varint() { // supposed to be signed and js doesn't handle 64 bits...
            let rval = 0;
            for (let j=0;j<8;j++) {
                let v = data.getUint8(pos++);
                rval = (rval << 7) | (v&0x7f);
                if ((v & 0x80) == 0)
                    return rval;
            }
            return (rval << 8) | data.getUint8(pos++);
        }
        if (type == 5 || type == 2) pos += 4
        let tlen = type == 5 ? 0 : varint();
        let rowid =  (type == 13 || type == 5) ? varint() : undefined;
        let payload
        let tuple: Tuple = []
        if (type !== 5) {
            let u = data.byteLength;
            let x = type === 13 ? u-35 : (((u-12)*64/255)|0)-23;
            if (tlen <= x) {
                payload = sliceView(data,pos,pos+tlen);
            } else {
                payload = new DataView(new ArrayBuffer(tlen));
                let rest = tlen;
                let offset = 0;
                let m = (((u-12)*32/255)|0)-23;
                let k = m + ((tlen-m)%(u-4));
                let l = (k>x) ? m : k;
                copyView(payload, offset, data, pos, l);
                offset += l;
                pos += l;
                rest -= l;
                for (let over = data.getUint32(pos);over != 0;over = data.getUint32(0)) {
                    data = this.getPage(over);
                    pos = 4;
                    if (rest < u - 4) {
                        copyView(payload, offset, data, 4, rest);
                        break;
                    } else {
                        copyView(payload, offset, data, 4, u-4);
                        rest -= u-4;
                        offset += u-4;
                    }
                }
            }
            assert(payload.byteLength == tlen, "Length mismatch");
            tuple = decode_(payload)
            if (rowid != undefined) tuple.unshift(rowid)
        } else if (rowid) {
            tuple = [rowid]
        }
        return tuple;
    }
}

export function decode_(data: DataView): Value[] {
    let pos = 0;
    function varint() {
        let rval = 0;
        for (let j=0;j<8;j++) {
            let v = data.getUint8(pos++);
            rval = (rval << 7) | (v&0x7f);
            if ((v & 0x80) == 0)
                return rval;
        }
        return (rval << 8) | data.getUint8(pos++);
    }

    let hlen = varint();
    let hend = hlen;
    let types = [];
    while (pos < hend) types.push(varint());
    let row = types.map(t => {
        switch (t) {
            case 0:
                return null;
            // FIXME - 64 bits don't fit into javascript integers.
            case 1: case 2: case 3:
            case 4: case 5: case 6:
                var mask = 0x80;
                var value = data.getUint8(pos++);
                for (;t>1;t--) {
                    mask = mask << 8;
                    value = (value<<8)+data.getUint8(pos++);
                }
                return (value&mask) ? (value-2*mask) : value;
            case 7:
                pos += 8;
                return data.getFloat64(pos-8); // BE?
            case 8:
                return 0;
            case 9:
                return 1;
            default:
                if (t > 11) {
                    let len = (t-12)>>1;
                    let v = sliceView(data,pos,pos+len);
                    assert(v.byteLength == len, 'length mismatch');
                    pos += len;
                    return t&1 ? td.decode(v) : v;
                }
                assert(false, `unhandled col type {t}`);
        }
    });
    return row;
}
