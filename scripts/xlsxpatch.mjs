/**
 * xlsxpatch — แก้ไฟล์ .xlsx ที่มีอยู่แบบ "ผ่าตัดเฉพาะจุด" โดยไม่แตะส่วนอื่นเลย
 *   ต่างจาก xlsxwrite.mjs (สร้างไฟล์ใหม่ทั้งใบ = สูตร/ฟอร์แมต/ชีตอื่นหายหมด — ห้ามใช้กับไฟล์เจ้าของ)
 *
 * วิธีทำงาน: แตก zip → แก้เฉพาะ entry ที่สั่ง → ประกอบ zip กลับ
 *   entry ที่ไม่ได้แก้ = คัดลอกไบต์เดิมทั้งดุ้น (deflate เดิม) → สูตร ชื่อชีต named range ฟอร์แมต ครบเหมือนเดิม
 *
 * API
 *   const x = openXlsx(path)
 *   x.sheetPath("ราคาออโต้")            → "xl/worksheets/sheetN.xml"
 *   x.getText(idx) / x.addText(s)        → sharedStrings (คืน index)
 *   x.entry(name) / x.setEntry(name, buf)
 *   x.save(outPath)
 */
import fs from "node:fs";
import zlib from "node:zlib";

const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return t;
})();
const crc32 = (b) => { let c = -1; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };

function unzip(buf) {
  let i = buf.length - 22;
  while (i >= 0 && buf.readUInt32LE(i) !== 0x06054b50) i--;
  if (i < 0) throw new Error("ไม่ใช่ zip");
  const cnt = buf.readUInt16LE(i + 10);
  let off = buf.readUInt32LE(i + 16);
  const out = [];
  for (let k = 0; k < cnt; k++) {
    const nLen = buf.readUInt16LE(off + 28), xLen = buf.readUInt16LE(off + 30), cLen = buf.readUInt16LE(off + 32);
    const name = buf.toString("utf8", off + 46, off + 46 + nLen);
    const lho = buf.readUInt32LE(off + 42);
    const method = buf.readUInt16LE(off + 10), csize = buf.readUInt32LE(off + 20);
    const lnLen = buf.readUInt16LE(lho + 26), lxLen = buf.readUInt16LE(lho + 28);
    const dataStart = lho + 30 + lnLen + lxLen;
    const raw = buf.subarray(dataStart, dataStart + csize);
    out.push({ name, method, raw });
    off += 46 + nLen + xLen + cLen;
  }
  return out;
}

function zip(files) {
  const chunks = [], central = [];
  let offset = 0;
  for (const f of files) {
    const nameBuf = Buffer.from(f.name, "utf8");
    const data = f.deflated ?? zlib.deflateRawSync(f.data, { level: 9 });
    const crc = f.crc ?? crc32(f.data);
    const usize = f.usize ?? f.data.length;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6);
    lh.writeUInt16LE(8, 8); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18);
    lh.writeUInt32LE(usize, 22); lh.writeUInt16LE(nameBuf.length, 26);
    chunks.push(lh, nameBuf, data);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(8, 10); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20);
    ch.writeUInt32LE(usize, 24); ch.writeUInt16LE(nameBuf.length, 28); ch.writeUInt32LE(offset, 42);
    central.push(ch, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([Buffer.concat(chunks), cd, end]);
}

export function openXlsx(path) {
  const entries = unzip(fs.readFileSync(path));
  const cache = new Map();
  const inflate = (e) => (e.method === 0 ? e.raw : zlib.inflateRawSync(e.raw));
  const get = (name) => {
    if (cache.has(name)) return cache.get(name);
    const e = entries.find((x) => x.name === name);
    if (!e) return null;
    const b = inflate(e); cache.set(name, b); return b;
  };
  const changed = new Map();
  const api = {
    names: () => entries.map((e) => e.name),
    entry: (name) => (changed.has(name) ? changed.get(name) : get(name)),
    setEntry: (name, buf) => changed.set(name, Buffer.isBuffer(buf) ? buf : Buffer.from(buf, "utf8")),
    /** ชื่อชีต → path ของ xml (ผ่าน workbook.xml + rels) */
    sheetPath(sheetName) {
      const wb = get("xl/workbook.xml").toString("utf8");
      const m = new RegExp('<sheet[^>]*name="' + sheetName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '"[^>]*r:id="(rId\\d+)"').exec(wb);
      if (!m) throw new Error("ไม่เจอชีต " + sheetName);
      const rels = get("xl/_rels/workbook.xml.rels").toString("utf8");
      const r = new RegExp('Id="' + m[1] + '"[^>]*Target="([^"]+)"').exec(rels);
      if (!r) throw new Error("ไม่เจอ rel ของ " + sheetName);
      return "xl/" + r[1].replace(/^\/?xl\//, "");
    },
    save(out) {
      const files = entries.map((e) => {
        if (changed.has(e.name)) { const data = changed.get(e.name); return { name: e.name, data }; }
        return { name: e.name, deflated: e.method === 8 ? e.raw : zlib.deflateRawSync(e.raw, { level: 9 }), crc: crc32(inflate(e)), usize: inflate(e).length };
      });
      fs.writeFileSync(out, zip(files));
    },
  };
  return api;
}
