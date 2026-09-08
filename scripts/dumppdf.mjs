#!/usr/bin/env node
/**
 * dumppdf — ดึงข้อความจาก PDF (ฟอนต์ subset ภาษาไทย) โดยไม่พึ่งไลบรารี
 *   node scripts/dumppdf.mjs <ไฟล์.pdf> [maxChars]
 *
 * ⚠ 2 กับดักที่ทำให้ได้ข้อความมั่ว
 *   ① ต้องถอดทีละฟอนต์ (ToUnicode ของใครของมัน) — รวมตารางทุกฟอนต์เข้าด้วยกัน CID จะชนกัน
 *      ("ราคา" กลายเป็น "ร6ค6")
 *   ② PDF ที่ export จาก Sheets/Excel ยิง Td ทุกตัวอักษร — ถ้าขึ้นบรรทัดใหม่ทุก Td จะได้ทีละตัวอักษร
 *      → ขึ้นบรรทัดใหม่เฉพาะตอนย้ายแนวตั้ง (y ≠ 0) · ย้ายแนวนอนไกล ๆ = คั่นแท็บ (แยกคอลัมน์)
 */
import fs from "node:fs";
import zlib from "node:zlib";

const buf = fs.readFileSync(process.argv[2]);
const latin = buf.toString("latin1");

// ── ① เก็บ object ทั้งหมด (เลข → เนื้อ) + stream ที่ inflate แล้ว ──
const objBody = new Map(), objStream = new Map();
for (const m of latin.matchAll(/(\d+)\s+0\s+obj\b/g)) {
  const num = Number(m[1]);
  const start = m.index + m[0].length;
  const end = latin.indexOf("endobj", start);
  if (end < 0) continue;
  const body = latin.slice(start, end);
  objBody.set(num, body);
  const sm = /stream\r?\n/.exec(body);
  if (sm) {
    const s0 = start + sm.index + sm[0].length;
    const s1 = latin.indexOf("endstream", s0);
    if (s1 > 0) {
      try { objStream.set(num, zlib.inflateSync(buf.subarray(s0, s1)).toString("latin1")); } catch { /* ไม่ใช่ flate */ }
    }
  }
}

// ── ② ตาราง ToUnicode ของแต่ละ object ──
const u = (h) => String.fromCharCode(...(h.match(/.{4}/g) || []).map((x) => parseInt(x, 16)));
const cmapOf = (objNum) => {
  const s = objStream.get(objNum);
  if (!s) return null;
  const map = new Map();
  for (const blk of s.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))
    for (const p of blk[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) map.set(parseInt(p[1], 16), u(p[2]));
  for (const blk of s.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const p of blk[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      const a = parseInt(p[1], 16), b = parseInt(p[2], 16), c = parseInt(p[3], 16);
      for (let i = a; i <= b && i - a < 65535; i++) map.set(i, String.fromCharCode(c + (i - a)));
    }
    for (const p of blk[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*\[([\s\S]*?)\]/g)) {
      const a = parseInt(p[1], 16);
      let i = 0;
      for (const q of p[3].matchAll(/<([0-9A-Fa-f]+)>/g)) map.set(a + i++, u(q[1]));
    }
  }
  return map.size ? map : null;
};

// ── ③ ชื่อฟอนต์ในหน้า (/F1) → ตาราง ToUnicode ──
const fontMap = new Map();
for (const [num, body] of objBody) {
  const tu = /\/ToUnicode\s+(\d+)\s+0\s+R/.exec(body);
  if (!tu) continue;
  const cm = cmapOf(Number(tu[1]));
  if (cm) fontMap.set(num, cm);
}
const nameToMap = new Map();
for (const body of objBody.values()) {
  const fd = /\/Font\s*<<([\s\S]*?)>>/.exec(body);
  if (!fd) continue;
  for (const p of fd[1].matchAll(/\/(\w+)\s+(\d+)\s+0\s+R/g)) {
    const cm = fontMap.get(Number(p[2]));
    if (cm) nameToMap.set(p[1], cm);
  }
}

// ── ④ ถอดข้อความ (สลับตารางตาม /Fx Tf) ──
const TOK = new RegExp(
  [
    String.raw`\/(\w+)\s+[\d.]+\s+Tf`,                       // 1 = เปลี่ยนฟอนต์
    String.raw`(\[[^\]]*\]\s*TJ)`,                            // 2 = ข้อความชุด
    String.raw`(<[0-9A-Fa-f\s]+>\s*Tj)`,                      // 3 = ข้อความเดี่ยว
    String.raw`(-?[\d.]+)\s+(-?[\d.]+)\s+(?:Td|TD)`,          // 4,5 = ย้ายตำแหน่ง
    String.raw`(T\*|\bET\b)`,                                 // 6 = ขึ้นบรรทัด/จบบล็อก
  ].join("|"),
  "g",
);
const out = [];
for (const s of objStream.values()) {
  if (!/(Tj|TJ)/.test(s)) continue;
  let cur = null, line = "";
  const dec = (hex) => (hex.replace(/\s+/g, "").match(/.{1,4}/g) || [])
    .map((c) => (cur ? cur.get(parseInt(c, 16)) ?? "" : "")).join("");
  for (const m of s.matchAll(TOK)) {
    if (m[1]) { cur = nameToMap.get(m[1]) ?? cur; continue; }
    if (m[2]) { for (const p of m[2].matchAll(/<([0-9A-Fa-f\s]+)>/g)) line += dec(p[1]); continue; }
    if (m[3]) { const p = /<([0-9A-Fa-f\s]+)>/.exec(m[3]); if (p) line += dec(p[1]); continue; }
    if (m[4] != null) {
      if (Math.abs(Number(m[5])) > 0.5) { if (line.trim()) out.push(line.trim()); line = ""; }
      else if (Number(m[4]) > 20 && line && !line.endsWith("\t")) line += "\t";
      continue;
    }
    if (line.trim()) out.push(line.trim());
    line = "";
  }
  if (line.trim()) out.push(line.trim());
}
console.error("(ฟอนต์ที่ถอดได้ " + nameToMap.size + " ตัว · " + out.length + " บรรทัด)");
console.log(out.join("\n").slice(0, Number(process.argv[3] || 8000)));
