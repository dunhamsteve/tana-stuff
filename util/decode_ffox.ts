// /Users/dunham/Library/Application Support/Firefox/Profiles/g7k1cmzj.default-release/storage/default/https+++app.tana.inc/idb
// ./2916616319NtoatoeB.files/8

// StructuredClone
let ID=0

"snappy framed file";

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {homedir} from "node:os";

let home = homedir();
// probably need to glob this to make it usuable in general
let dn = `${home}/Library/Application Support/Firefox/Profiles/g7k1cmzj.default-release/storage/default/https+++app.tana.inc/idb/2916616319NtoatoeB.files`;

const td = new TextDecoder("iso-8859-1");

// js/src/vm/StructuredClone.cpp

// Decode a mozilla StructuredClone value
function decode(buf: Buffer) {
  writeFileSync("decomp.bin", buf);
  let p = 0;
  const readPair = () => {
    let data = buf.readUint32LE(p);
    let tag = buf.readUint32LE(p + 4);
    p += 8;
    return [tag, data];
  };
  const endTag = () => {
    if (buf.readUint32LE(p + 4) === 0xffff0013) {
      p += 8;
      return true;
    }
  };
  function readItem() {
    let [tag, data] = readPair();
    // StructuredClone.cpp:2902
    switch (tag) {
      case 0xffff0000: // SCTAG_NULL
        return null;
      case 0xffff0001: // SCTAG_UNDEFINED
        return undefined;
      case 0xffff0002: // SCTAG_BOOLEAN
        return !!data;
      case 0xffff0003: // SCTAG_INT32
        return data;
      case 0xffff0004: // SCTAG_STRING
        // # chars...

        let len = data & 0x7fffffff;
        let utf8 = data & 0x80000000;

        let value;
        if (utf8) {
          value = td.decode(buf.subarray(p, p + len));
          if (value.includes('sunchoke')) writeFileSync(`raw${ID++}.bin`, buf.subarray(p,p+len))
          p += len;
        } else {
          value = "";
          while (len--) {
            value += String.fromCharCode(buf.readUint16LE(p));
            p += 2;
          }
          if (value.includes('sunchoke')) writeFileSync(`raw${ID++}.bin`, buf.subarray(p- value.length*2,p))
        }
        while (p % 8) p++;
        return value;
      // case 0xffff0005: // SCTAG_DATE_OBJECT
      // case 0xffff0006: // SCTAG_REGEXP_OBJECT
      case 0xffff0007: {
        // SCTAG_ARRAY_OBJECT
        let obj: any[] = [];
        while (!endTag()) {
          let ix = readItem();
          let item = readItem();
          obj[ix] = item;
        }
        return obj;
      }

      case 0xffff0008: { // SCTAG_OBJECT_OBJECT
        let obj: any = {};
        while (!endTag()) obj[readItem()] = readItem();
        return obj;
      }

      // case 0xffff0008: // SCTAG_ARRAY_BUFFER_OBJECT

      case 0xffff000a: // SCTAG_BOOLEAN_OBJECT
        return !!data;
      // case 0xffff000B: // SCTAG_STRING_OBJECT
      // case 0xffff000C: // SCTAG_NUMBER_OBJECT
      // case 0xffff000D: // SCTAG_BACK_REFERENCE_OBJECT
      // case 0xffff000E: // SCTAG_DO_NOT_USE_1
      // case 0xffff000F: // SCTAG_DO_NOT_USE_2
      // case 0xffff0010: // SCTAG_TYPED_ARRAY_OBJECT_V2
      // case 0xffff0011: // SCTAG_MAP_OBJECT
      // case 0xffff0012: // SCTAG_SET_OBJECT
      // case 0xffff0013: // SCTAG_END_OF_KEYS
      // case 0xffff000F: // SCTAG_DO_NOT_USE_3

      default:
        if (tag <= 0xfff00000) return buf.readDoubleLE(p - 8);
        throw new Error(
          `unhandled tag ${tag.toString(16)} data ${data.toString(16)}`
        );
    }
  }
  let [t, d] = readPair(); // HEADER
  return readItem();
}

export function decode_file(data: Buffer) {
  // This is a snappy decoder, followed by a code to `decode` at the end.
  let out = Buffer.alloc(1024);
  let p = 0;
  let q = 0;
  function varint() {
    let acc = 0;
    let sh = 0;
    for (;;) {
      acc |= (data[p] & 127) << sh;
      if (data[p++] < 128) return acc;
      sh += 7;
    }
  }
  while (p < data.byteLength) {
    let ty = data[p];
    let sz = data[p + 1] | (data[p + 2] << 8) | (data[p + 3] << 16);
    p += 4;
    if (ty === 255) {
      p += sz;
    } else if (ty === 0) {
      let end = p + sz;
      p += 4; // crc
      let outsz = varint();
      if (out.length < q + outsz) {
        let newsz = Math.max(q + outsz, out.length * 2);
        let tmp = Buffer.alloc(newsz);
        out.copy(tmp, 0, 0, q);
        out = tmp;
      }
      while (p < end) {
        let cmd = data[p] & 3;
        let rest = data[p] >> 2;
        p++;
        switch (cmd) {
          case 0: {
            // lit
            let len = 0;
            let shift = 0;
            switch (rest) {
              case 63:
                len |= data[p++] << shift;
                shift += 8;
              case 62:
                len |= data[p++] << shift;
                shift += 8;
              case 61:
                len |= data[p++] << shift;
                shift += 8;
              case 60:
                len |= data[p++] << shift;
                shift += 8;
                break;
              default:
                len = rest;
            }
            len++;
            while (len--) out[q++] = data[p++];

            // data.copy(out, q, p, p + len);
            // p += len;
            // q += len;

            break;
          }
          case 1: {
            let len = (rest & 7) + 4;
            let off = ((rest & 56) << 5) | data[p++];
            while (len) {
              out[q] = out[q - off];
              q++;
              len--;
            }
            break;
          }
          case 2:
            {
              let len = rest + 1;
              let off = data.readUint16LE(p);
              p += 2;
              while (len) {
                out[q] = out[q - off];
                q++;
                len--;
              }
            }
            break;
          case 3:
            {
              let len = rest + 1;
              let off = data.readUint32LE(p);
              p += 4;
              while (len) {
                out[q] = out[q - off];
                q++;
                len--;
              }
            }
            break;
          default:
            throw new Error(`bad cmd ${cmd}`);
        }
        // if (q >= 36296) console.log(`FAIL at ${q} c ${cmd} r ${rest} p ${p}`)
      }
    } else if (ty === 1) {
      // TODO
    } else {
      console.log(`bad chunk type ${ty}`);
    }
  }
  return decode(out.subarray(0, q));
}
