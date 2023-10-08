import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "fs";
import { readdir, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { homedir } from "node:os";
import { DataStore, Database } from "./database";
import { Database as SQLite } from "./sqlite";
import { execute } from "./eval";

let sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function assert(thing: any): asserts thing is string {
  if (typeof thing !== "string")
    throw new Error(`expected string got ${thing}`);
}

let td = new TextDecoder("utf8");
let td1 = new TextDecoder("iso-8859-1");
let td16 = new TextDecoder("utf-16le"); // actually ucs-2, I think what to do?

function* walk(root: string): Generator<string> {
  for (let name of readdirSync(root)) {
    let fn = join(root, name);
    let st = statSync(fn);
    if (st.isDirectory()) {
      yield* walk(fn);
    } else {
      yield fn;
    }
  }
}

function makeMap(db: SQLite, query: string) {
  let rval: RSS = {};
  for (let [key, value] of execute(db, query)) {
    rval[key] = value;
  }
  return rval;
}
let count = 1;
function deserialize(dv: DataView) {
  let TERM = 0xffffffff;
  let POOL = 0xfffffffe;
  let p = 0;
  let pool: string[] = [];
//   writeFileSync(`out${count++}.bin`, dv);
  let u32 = () => {
    let rv = dv.getUint32(p, true);
    p += 4;
    return rv;
  };
  let u8 = () => {
    let rv = dv.getUint8(p);
    p += 1;
    return rv;
  };
  let u16 = () => {
    let rv = dv.getUint16(p, true);
    p += 2;
    return rv;
  };
  let string = () => {
    let l = u32();
    if (l === TERM) throw new Error("STOPITERATION");
    if (l === POOL) {
      if (pool.length < 256) {
        return pool[u8()];
      } else if (pool.length < 65536) {
        return pool[u16()];
      } else throw new Error("TODO");
    }
    if (l & 0x80000000) {
      // latin1
      let end = p + (l & 0x7fffffff);
      let rval = td1.decode(
        dv.buffer.slice(p + dv.byteOffset, end + dv.byteOffset)
      );
      p = end;
      pool.push(rval);
      return rval;
    }
    let end = p + l * 2;
    let rval = td16.decode(
      dv.buffer.slice(p + dv.byteOffset, end + dv.byteOffset)
    );
    p = end;
    pool.push(rval);
    return rval;
  };
  let value = () => {
    let tag = u8();
    if (tag == 1) {
      let l = u32();
      let rval = new Array(l);
      while (dv.getUint32(p, true) !== TERM) {
        rval[u32()] = value();
      }
      if (u32() !== TERM) throw new Error("Bad TERM");
      return rval;
    }
    if (tag == 2) {
      let rval: Record<string, any> = {};
      while (dv.getUint32(p, true) !== TERM) {
        rval[string()] = value();
      }
      if (u32() !== TERM) throw new Error("Bad TERM");
      
      return rval;
    }
    if (tag == 5) {
      let val = dv.getInt32(p, true);
      p += 4;
      return val;
    }
    if (tag == 6) return 0;
    if (tag == 7) return 1;
    if (tag == 8) return false;
    if (tag == 9) return true;
    if (tag == 10) {
      let val = dv.getFloat64(p, true);
      p += 8;
      return val;
    }
    if (tag == 16) return string();
    throw new Error(`unhandled tag ${tag} at ${p} of ${dv.byteLength}`);
  };
  u32(); // version
  return value();
}

type RSS = Record<string, string>;
async function main() {
  let home = homedir();
  let root = `${home}/Library/Containers/com.apple.Safari.WebApp/Data/Library/Containers`;
  for (let dn of await readdir(root)) {
    let plist = `${root}/${dn}/Library/WebApp/DocumentsState.plist`;
    if (!existsSync(plist)) continue;
    let wkdir = `${root}/${dn}/Library/WebKit/WebsiteData/Default`;
    for (let dn of await readdir(wkdir)) {
      let oroot = `${wkdir}/${dn}/${dn}`;
      let ofn = `${oroot}/origin`;
      if (!existsSync(ofn)) continue;
      let odata = readFileSync(ofn);
      let origin = decode_origin(odata);
      if (!origin.includes("app.tana.inc")) continue;

      // umm, at this point I need sqlite, really should just use python, but press on
      for (let fn of readdirSync(`${oroot}/IndexedDB`)) {
        let raw = readFileSync(`${oroot}/IndexedDB/${fn}/IndexedDB.sqlite3`);
        let db = new SQLite(raw.buffer);
        let meta: RSS = {};
        for (let [key, value] of execute(
          db,
          `select key,value from "IDBDatabaseInfo"`
        )) {
          meta[key] = value;
        }
        if (meta.DatabaseName !== "NoteBoat") continue;
        let tables: RSS = {};
        for (let [name, id] of execute(
          db,
          `select name, id from "ObjectStoreInfo"`
        )) {
          tables[name] = id;
        }
        if (!tables.keyvaluepairs) continue;
        for (let [rk, rv] of execute(
          db,
          `select key,value from "Records" where objectStoreId = ${tables.keyvaluepairs}`
        )) {
          let dv: DataView = rv;
          let data = deserialize(dv) as Database;
        //   writeFileSync(`out${count++}.json`, JSON.stringify(data, null, "  "))
          let wsid = data.docs?.[0].id
          if (wsid === "drT7__5gJr") {
            await processDatabase(data);
          }
        }
      }
    }
  }
  return;
}


function decode_origin(buf: Buffer) {
  let p = 0;
  let rval: string[] = [];
  while (p < buf.length) {
    if (buf[p] == 0) break;
    let l = buf.readInt32LE(p);
    p += 4;
    let t = buf[p];
    p += 1;
    if (t == 1) rval.push(td.decode(buf.slice(p, p + l)));
    else throw new Error(`bad type ${t}`);
    p += l;
  }
  return rval;
}

main();
async function processDatabase(data: Database) {
  let wsid = data.docs[0].id;
  let store = new DataStore(data);
  // Here is the shape of it. There is no differentiation
  // that I can find between a link and an uploaded file.
  // So we'll use heuristics on the url.
  // And I guess for now, node id for filename?
  // Queries are expensive without an index...
  let results = store.query(`
    $meta SYS_T15 $v .
    $node _metaNodeId $meta .
    $v name $url .
    $node name $name
    `);
  // write latest to dist
  await writeFile("www/out.json", JSON.stringify(data, null, "  "));
  // get files
  for (let sol of results) {
    // console.log(sol)
    let { $node, $name, $url } = sol;
    assert($url);
    console.log("*", $name);
    await mkdir(`backup/${wsid}`, { recursive: true });
    if ($url.includes("firebasestorage")) {
      let fn = `backup/${wsid}/${$node}`;
      if (existsSync(fn)) continue;
      console.log("fetch", fn, "from", $url);
      let rval = await fetch($url);
      let res = await rval.arrayBuffer();
      await writeFile(fn, new DataView(res));
      await sleep(1000);
    }
  }
}
