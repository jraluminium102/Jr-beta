#!/usr/bin/env node
/**
 * pdftable — ดึง "ตาราง" จาก PDF (ฟอนต์ subset ภาษาไทย) โดยไม่พึ่งไลบรารี
 *   node scripts/pdftable.mjs <ไฟล์.pdf> [หน้าที่เริ่ม] [จำนวนหน้า]
 *
 * ต่างจาก dumppdf: ตัวนี้เก็บพิกัด (x, y) ของทุกก้อนข้อความ แล้วจัดกลุ่มเป็นแถว/คอลัมน์
 *   → ได้ตารางจริง ไม่ใช่ข้อความไหลเป็นบรรทัดเดียว
 * โมเดลพิกัดแบบง่าย: BT รีเซ็ต · Tm ตั้งค่าสัมบูรณ์ · Td/TD บวกสะสม · T* ลงบรรทัด
 */
import fs from "node:fs";
import zlib from "node:zlib";

const buf = fs.readFileSync(process.argv[2]);
const latin = buf.toString("latin1");

const objBody = new Map(), objStream = new Map();
for (const m of latin.matchAll(/(\d+)\s+0\s+obj\b/g)) {
  const num = Number(m[1]);
  const start = m.index + m[0].length;
  const end = latin.indexOf("endobj", start);
  if (end < 0) continue;
  objBody.set(num, latin.slice(start, end));
  const sm = /stream\r?\n/.exec(latin.slice(start, end));
  if (sm) {
    const s0 = start + sm.index + sm[0].length;
    const s1 = latin.indexOf("endstream", s0);
    if (s1 > 0) { try { objStream.set(num, zlib.inflateSync(buf.subarray(s0, s1)).toString("latin1")); } catch { /* ไม่ใช่ flate */ } }
  }
}

const u = (h) => String.fromCharCode(...(h.match(/.{4}/g) || []).map((x) => parseInt(x, 16)));
const cmapOf = (n) => {
  const s = objStream.get(n); if (!s) return null;
  const map = new Map();
  for (const blk of s.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))
    for (const p of blk[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) map.set(parseInt(p[1], 16), u(p[2]));
  for (const blk of s.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const p of blk[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      const a = parseInt(p[1], 16), b = parseInt(p[2], 16), c = parseInt(p[3], 16);
      for (let i = a; i <= b && i - a < 65535; i++) map.set(i, String.fromCharCode(c + (i - a)));
    }
    for (const p of blk[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*\[([\s\S]*?)\]/g)) {
      const a = parseInt(p[1], 16); let i = 0;
      for (const q of p[3].matchAll(/<([0-9A-Fa-f]+)>/g)) map.set(a + i++, u(q[1]));
    }
  }
  return map.size ? map : null;
};
const fontMap = new Map();
for (const [num, body] of objBody) {
  const tu = /\/ToUnicode\s+(\d+)\s+0\s+R/.exec(body);
  if (tu) { const cm = cmapOf(Number(tu[1])); if (cm) fontMap.set(num, cm); }
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

const TOK = new RegExp([
  String.raw`\/(\w+)\s+[\d.]+\s+Tf`,
  String.raw`(\[[^\]]*\]\s*TJ)`,
  String.raw`(<[0-9A-Fa-f\s]+>\s*Tj)`,
  String.raw`(-?[\d.]+)\s+(-?[\d.]+)\s+(?:Td|TD)`,
  String.raw`(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+Tm`,
  String.raw`\bBT\b`,
  String.raw`\bT\*`,
].join("|"), "g");

const pages = [];
for (const s of objStream.values()) {
  if (!/(Tj|TJ)/.test(s)) continue;
  let cur = null, x = 0, y = 0, lead = 12;
  const items = [];
  const dec = (hex) => (hex.replace(/\s+/g, "").match(/.{1,4}/g) || [])
    .map((c) => (cur ? cur.get(parseInt(c, 16)) ?? "" : "")).join("");
  for (const m of s.matchAll(TOK)) {
    if (m[1]) { cur = nameToMap.get(m[1]) ?? cur; continue; }
    if (m[2]) { let t = ""; for (const p of m[2].matchAll(/<([0-9A-Fa-f\s]+)>/g)) t += dec(p[1]); if (t) items.push({ x, y, t }); continue; }
    if (m[3]) { const p = /<([0-9A-Fa-f\s]+)>/.exec(m[3]); const t = p ? dec(p[1]) : ""; if (t) items.push({ x, y, t }); continue; }
    if (m[4] != null) { x += Number(m[4]); y += Number(m[5]); continue; }
    if (m[6] != null) { x = Number(m[10]); y = Number(m[11]); continue; }
    if (m[0] === "BT") { x = 0; y = 0; continue; }
    if (m[0].startsWith("T*")) { y -= lead; continue; }
  }
  if (items.length) pages.push(items);
}

const from = Number(process.argv[3] || 1), count = Number(process.argv[4] || pages.length);
pages.slice(from - 1, from - 1 + count).forEach((items, i) => {
  console.log("═══════════ หน้า " + (from + i) + " ═══════════");
  const rows = new Map();
  for (const it of items) {
    const key = Math.round(it.y / (Number(process.env.YBUCKET) || 4)) * (Number(process.env.YBUCKET) || 4);              // จับกลุ่มแถว (คลาดเคลื่อน ±2)
    if (!rows.has(key)) rows.set(key, []);
    rows.get(key).push(it);
  }
  for (const [, arr] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
    arr.sort((a, b) => a.x - b.x);
    let line = "", lastX = null;
    for (const it of arr) {
      if (lastX != null && it.x - lastX > 14) line += " | ";
      line += it.t;
      lastX = it.x;
    }
    if (line.trim()) console.log(line.trim());
  }
});
