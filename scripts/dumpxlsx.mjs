/**
 * dumpxlsx — อ่านไฟล์ .xlsx โดยไม่พึ่งไลบรารี (xlsx = zip + xml)
 *   node scripts/dumpxlsx.mjs <ไฟล์.xlsx> [ชื่อชีต|เลขชีต] [--grep คำค้น]
 *   node scripts/dumpxlsx.mjs <ไฟล์.xlsx> --sheets     # ดูรายชื่อชีต
 *
 * ⚠ ลำดับชีตต้องอ่านจาก workbook.xml + rels (ไม่ใช่เรียงชื่อไฟล์ sheetN.xml)
 *   ไฟล์ ≥10 ชีต ชื่อไฟล์เรียงแบบข้อความ (1,10,11,2...) → ถ้าไม่ใช้ rels จะสลับชีตกันเงียบ ๆ
 */
import fs from "node:fs";
import zlib from "node:zlib";

// ── unzip (store/deflate) จาก central directory ──
function unzip(buf) {
  const out = new Map();
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--)
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("ไม่ใช่ไฟล์ zip/xlsx");
  const n = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let k = 0; k < n; k++) {
    const nameLen = buf.readUInt16LE(p + 28), extLen = buf.readUInt16LE(p + 30), cmtLen = buf.readUInt16LE(p + 32);
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    const lho = buf.readUInt32LE(p + 42);
    const lNameLen = buf.readUInt16LE(lho + 26), lExtLen = buf.readUInt16LE(lho + 28);
    const start = lho + 30 + lNameLen + lExtLen;
    const raw = buf.subarray(start, start + size);
    out.set(name, method === 0 ? raw : zlib.inflateRawSync(raw));
    p += 46 + nameLen + extLen + cmtLen;
  }
  return out;
}

const dec = (s) => String(s).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d)).replace(/&amp;/g, "&");

function sharedStrings(zip) {
  const b = zip.get("xl/sharedStrings.xml");
  if (!b) return [];
  const xml = b.toString("utf8");
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)]
    .map((m) => [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => dec(t[1])).join(""));
}

/** ชีตทั้งหมด เรียงตามลำดับจริงใน workbook (ผ่าน rels) */
export function sheetList(zip) {
  const wb = zip.get("xl/workbook.xml").toString("utf8");
  const rel = zip.get("xl/_rels/workbook.xml.rels").toString("utf8");
  // ⚠ ลำดับ attribute ในไฟล์จริงสลับได้ (บางไฟล์ Target มาก่อน Id) → ดึงทีละ tag แล้วอ่านทีละ attr
  const relMap = new Map();
  for (const m of rel.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = (m[1].match(/\bId="([^"]+)"/) || [])[1];
    const tg = (m[1].match(/\bTarget="([^"]+)"/) || [])[1];
    if (id && tg) relMap.set(id, tg.replace(/^\/?xl\//, "").replace(/^\//, ""));
  }
  const out = [];
  let i = 0;
  for (const m of wb.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const name = (m[1].match(/\bname="([^"]*)"/) || [])[1];
    const rid = (m[1].match(/\br:id="([^"]+)"/) || m[1].match(/\bid="([^"]+)"/) || [])[1];
    if (name == null) continue;
    // ไม่มี rels ให้ใช้ → ถอยไปเดาตามลำดับที่ประกาศใน workbook (sheet1, sheet2, …)
    const target = (rid && relMap.get(rid)) || `worksheets/sheet${i + 1}.xml`;
    out.push({ name: dec(name), path: "xl/" + target });
    i++;
  }
  return out;
}

const colOf = (ref) => (ref.match(/^[A-Z]+/) || ["A"])[0];
const rowOf = (ref) => Number((ref.match(/\d+/) || [0])[0]);

/** สูตรของชีต → [{row, cells:{A:"=...",B:"=..."}}] — ค่าที่เห็นในไฟล์เป็นแค่ "ผลลัพธ์ของขนาดตัวอย่าง"
 *  ตอนพอร์ตสูตรเข้าเว็บต้องอ่านตัวสูตร ไม่ใช่ผลลัพธ์ ไม่งั้นได้เลขตายตัวของขนาดนั้นขนาดเดียว */
export function readFormulas(zip, path) {
  const xml = zip.get(path)?.toString("utf8") ?? "";
  const rows = new Map();
  for (const m of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const ref = (m[1].match(/r="([A-Z]+\d+)"/) || [])[1];
    const f = (String(m[2] ?? "").match(/<f[^>]*>([\s\S]*?)<\/f>/) || [])[1];
    if (!ref || f == null || f === "") continue;
    const r = rowOf(ref);
    if (!rows.has(r)) rows.set(r, {});
    rows.get(r)[colOf(ref)] = "=" + dec(f);
  }
  return [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([row, cells]) => ({ row, cells }));
}

/** ตารางเซลล์ของชีต → [{row, cells:{A:"..",B:".."}}] */
export function readSheet(zip, path, ss) {
  const xml = zip.get(path)?.toString("utf8") ?? "";
  const rows = new Map();
  // ⚠ attr ต้อง lazy — ถ้า greedy เจอเซลล์ปิดในตัว `<c r="K2"/>` มันจะกิน `/` แล้วไปจับ `>`
  //   ทำให้ body ลากยาวข้ามไปกลืนเซลล์ถัดไปทั้งเซลล์ (ข้อมูลหายเงียบ ๆ)
  //   Excel ปกติไม่เขียนเซลล์ว่าง เลยไม่เคยโผล่ — แต่ไฟล์จากเครื่องมืออื่นเขียน
  for (const m of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const attr = m[1], body = m[2] ?? "";
    const ref = (attr.match(/r="([A-Z]+\d+)"/) || [])[1];
    if (!ref) continue;
    const t = (attr.match(/t="([^"]+)"/) || [])[1];
    let v;
    if (t === "inlineStr") v = [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => dec(x[1])).join("");
    else {
      const raw = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      if (raw == null) continue;
      v = t === "s" ? (ss[Number(raw)] ?? "") : dec(raw);
    }
    if (v === "") continue;
    const r = rowOf(ref);
    if (!rows.has(r)) rows.set(r, {});
    rows.get(r)[colOf(ref)] = v;
  }
  return [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([row, cells]) => ({ row, cells }));
}

export function openXlsx(file) {
  const zip = unzip(fs.readFileSync(file));
  const ss = sharedStrings(zip);
  return { zip, ss, sheets: sheetList(zip), read: (p) => readSheet(zip, p, ss) };
}

// ── CLI ──
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` || process.argv[1]?.endsWith("dumpxlsx.mjs")) {
  const [file, arg] = process.argv.slice(2);
  if (!file) { console.log("ใช้: node scripts/dumpxlsx.mjs <ไฟล์.xlsx> [ชีต] [--grep คำ] [--formula]"); process.exit(1); }
  const x = openXlsx(file);
  const gi = process.argv.indexOf("--grep");
  const kw = gi > 0 ? process.argv[gi + 1] : null;
  if (arg === "--sheets" || (!arg && !kw)) {
    x.sheets.forEach((s, i) => console.log(`${i} ${s.name}`));
  } else {
    const targets = arg && arg !== "--grep" ? x.sheets.filter((s, i) => s.name === arg || String(i) === arg) : x.sheets;
    for (const s of targets) {
      const rows = process.argv.includes("--formula") ? readFormulas(x.zip, s.path) : x.read(s.path);
      const hit = kw ? rows.filter((r) => Object.values(r.cells).some((v) => String(v).includes(kw))) : rows;
      if (!hit.length) continue;
      console.log(`\n─── ${s.name} ───`);
      for (const r of hit) console.log(r.row, JSON.stringify(r.cells));
    }
  }
}
