// golden-snapshot.mjs — ตาข่ายกันพัง: render ทุกสินค้าใน index.html → จับ "ยอด/ชุด" เป็นลายนิ้วมือ
// ใช้:
//   node scripts/golden-snapshot.mjs --save   → บันทึก baseline (scripts/golden-baseline.json) ครั้งเดียวตอนของยังดี
//   node scripts/golden-snapshot.mjs          → render ใหม่ เทียบ baseline · ยอดไหนเปลี่ยน = เด้งแดง · exit 1 ถ้ามี diff
//
// แนวคิด: ตัวเลขสัมบูรณ์ไม่สำคัญ — ที่สำคัญคือ "เสถียร" ระหว่างแก้ · สินค้าตัวไหนยอดขยับโดยไม่ตั้งใจ = จับได้ใน ~30 วิ
// (กดเองเหลือไว้ verify เฉพาะ UX ที่แตะ · อันนี้กันราคาเพี้ยนข้ามกลุ่ม)
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const HTML_PATH = join(ROOT, "public/calculator/index.html");
const BASELINE = join(__dirname, "golden-baseline.json");
const SAVE = process.argv.includes("--save");

// cat → กลุ่มงาน (ค่าใน .i-group '1'..'7') — ยึดตาม FAM_CATS/skill mapping
const CAT2GROUP = {
  "บานเลื่อน":1,"บานเปิด":1,"ติดตาย":1,"บานเฟี้ยม":1,"บานกระทุ้ง":1,"เลื่อนภายใน":1,
  "PC Door":1,"YKK":1,"บานยก":1,"ดัดโค้ง":1,"บานหมุน":1,"บานเปลือย":1,"shower":1,
  "เส้นคาด":1,"ลูกฟูก+คอมโพสิททึบ":1,
  "ระแนง-บังตา":2,"ระแนง-ผนัง":2,"ระแนง-เกล็ด":2,"ราวบันได":2,"ประตูรั้ว":2,"ระแนง":2,
  "หลังคา":3,"ฝ้า-ผนัง":3,
  "ตู้อลู":4,"ฝาตู้":4,
  "มุ้ง":5,
  "กั้นห้องกระจก":6,
  "ม่านซิป":7,
};

// ===== boot JSDOM =====
const html = readFileSync(HTML_PATH, "utf8");
const vc = new VirtualConsole();
let jsErrors = [];
vc.on("jsdomError", (e) => { if (!/scrollTo|Not implemented/i.test(e.message)) jsErrors.push(e.message); });
const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc, url: "http://localhost/calculator/index.html" });
await new Promise((r) => { if (dom.window.document.readyState === "complete") r(); else dom.window.addEventListener("load", r); setTimeout(r, 2000); });
const w = dom.window, doc = w.document;
const fire = (el, t) => el.dispatchEvent(new w.Event(t, { bubbles: true }));

function noSvc() { ["svc-protect","svc-lift","svc-travel","svc-ship"].forEach(id => { const e = doc.getElementById(id); if (e && e.checked) { e.checked = false; fire(e, "change"); } }); }
function grand() {
  noSvc();
  try { w.calcQuote && w.calcQuote(); w.genQuote && w.genQuote(); } catch (e) { return { v: NaN, err: "calc:" + e.message }; }
  const g = doc.querySelector("#quoteContent .qtot .g");
  if (g) return { v: parseInt((g.textContent || "").replace(/\.\d+/g, "").replace(/[^\d]/g, ""), 10) };
  // fallback: รวมเป็นเงิน
  const m = (doc.getElementById("quoteContent") || {}).innerHTML;
  const mm = m && m.match(/รวมเป็นเงิน(?:<\/span>)*<span>([\d,\.]+)/);
  return { v: mm ? parseFloat(mm[1].replace(/,/g, "")) : NaN };
}

// ขนาดมาตรฐานต่อกลุ่ม (อะไรก็ได้ที่ "คงที่" · ตัวเลขไม่สำคัญ ขอเสถียร)
const SIZE = { 1:[1.5,2.0], 2:[2.0,1.5], 3:[4.0,3.0], 4:[1.0,2.0], 5:[1.0,2.0], 6:[2.0,2.4], 7:[2.0,2.5] };

// per-product size override — สินค้าที่มี block condition ต้องเทสในช่วงที่ทำได้ (กันผ่านค่า 0)
// lift_sms: บล็อก area>10 → เทสที่ 1.0×2.0 (area=2.0 → auto=SMS · ในช่วง)
// lift_aluinch: hidden ใน UI (auto logic) → เทสตรงๆ ที่ 1.5×2.0 (area=3.0 → ราคาคิดได้)
// ykk_vent: บล็อกนอกช่วง 0.6–0.9 × 2.0–2.2 → เทสที่ 0.8×2.1 (ในช่วง)
const SIZE_OVERRIDE = { "lift_sms": [1.0, 2.0], "lift_aluinch": [1.5, 2.0], "ykk_vent": [0.8, 2.1] };

// นับสินค้าจาก dropdown .i-prod จริง ต่อกลุ่ม (const PRODUCTS ไม่ขึ้น window)
function prodsInGroup(g) {
  doc.getElementById("items").innerHTML = "";
  try { w.addItem(doc.getElementById("items")); } catch (e) { return []; }
  const ch = doc.querySelector("#items .ch"); if (!ch) return [];
  const gs = ch.querySelector(".i-group"); if (gs) { gs.value = String(g); fire(gs, "change"); }
  const ps = ch.querySelector(".i-prod"); if (!ps) return [];
  return Array.from(ps.options).map(o => ({ id: o.value, name: (o.textContent || "").trim() })).filter(o => o.id);
}

function renderOne(g, id, name) {
  doc.getElementById("items").innerHTML = "";
  try { w.addItem(doc.getElementById("items")); } catch (e) { return { key: g + ":" + id, id, name, g, status: "addItem-err", note: e.message }; }
  const ch = doc.querySelector("#items .ch");
  if (!ch) return { key: g + ":" + id, id, name, g, status: "no-ch" };
  const gs = ch.querySelector(".i-group"); if (gs) { gs.value = String(g); fire(gs, "change"); }
  const ps = ch.querySelector(".i-prod");
  if (!ps) return { key: g + ":" + id, id, name, g, status: "not-in-group" };
  // inject option ชั่วคราวสำหรับ hidden product (autoLift · ไม่โผล่ใน dropdown จริง)
  let _injected = null;
  if (!ps.querySelector('option[value="' + id + '"]')) {
    _injected = doc.createElement("option"); _injected.value = id; _injected.textContent = name;
    ps.appendChild(_injected);
  }
  ps.value = id; fire(ps, "change");
  const [W, H] = SIZE_OVERRIDE[id] || SIZE[g] || [1.5, 2.0];
  const wi = ch.querySelector(".i-w"), hi = ch.querySelector(".i-h");
  if (wi) { wi.value = String(W); fire(wi, "input"); fire(wi, "change"); }
  if (hi) { hi.value = String(H); fire(hi, "input"); fire(hi, "change"); }
  const e0 = jsErrors.length;
  const r = grand();
  const err = jsErrors.length > e0 || r.err;
  return { key: g + ":" + id, id, name, g, w: W, h: H, total: Number.isFinite(r.v) ? r.v : null, status: err ? "js-error" : "ok", note: r.err || (jsErrors.length > e0 ? jsErrors.slice(e0).join(" | ").slice(0, 120) : "") };
}

// enumerate กลุ่มที่คิดราคาแบบ "1 ชิ้น 1 ราคา" (key = "g:id")
// ❌ ตัด G6 (กั้นห้องกระจก) — ใช้ flow room-builder ไม่คิดผ่าน i-prod เดี่ยว · ราคา default ค้างตอน init (flaky) · มี test เฉพาะ test/g6-phaseB-flags.mjs
const GROUPS = [1, 2, 3, 4, 5, 7];
const catalog = [];
for (const g of GROUPS) for (const o of prodsInGroup(g)) catalog.push({ g, id: o.id, name: o.name });
if (!catalog.length) { console.error("❌ นับสินค้าจาก dropdown ไม่ได้"); process.exit(2); }
// inject สินค้าที่ hidden ใน UI (auto-route) แต่ต้องตรวจ golden แยกว่าราคายังคงที่
// lift_aluinch: hidden=true (UI ซ่อน ใช้ lift_sms เป็น entry เดียว) → inject ด้วย SIZE_OVERRIDE [1.5,2.0]
if (!catalog.find(c => c.id === "lift_aluinch")) catalog.push({ g: 1, id: "lift_aluinch", name: "บานยก เซมิยูโร (บานใหญ่)" });

const rows = [];
for (const c of catalog) { jsErrors = jsErrors.slice(-50); rows.push(renderOne(c.g, c.id, c.name)); }

const ok = rows.filter(r => r.status === "ok");
const skipped = rows.filter(r => r.status !== "ok");

if (SAVE) {
  const out = { meta: { at: "baseline", catalog: catalog.length, captured: ok.length, skipped: skipped.length }, rows: rows.map(r => ({ key: r.key, id: r.id, name: r.name, g: r.g, total: r.total, status: r.status })) };
  writeFileSync(BASELINE, JSON.stringify(out, null, 1), "utf8");
  console.log(`✅ บันทึก baseline: ${ok.length} ตัวจับยอดได้ · ${skipped.length} ตัวข้าม (${BASELINE})`);
  if (skipped.length) console.log("   ข้าม:", skipped.map(r => r.key + "(" + r.status + ")").join(", "));
  process.exit(0);
}

// ===== compare mode =====
if (!existsSync(BASELINE)) { console.error("❌ ยังไม่มี baseline — รัน: node scripts/golden-snapshot.mjs --save ก่อน"); process.exit(2); }
const base = JSON.parse(readFileSync(BASELINE, "utf8"));
const bmap = new Map(base.rows.map(r => [r.key, r]));
const cmap = new Map(rows.map(r => [r.key, r]));
const diffs = [];
for (const r of rows) {
  const b = bmap.get(r.key);
  if (!b) { diffs.push(`🟢 ใหม่: G${r.g} ${r.id} (${r.name}) total=${r.total} [${r.status}]`); continue; }
  if (b.total !== r.total) diffs.push(`🟡 ยอดเปลี่ยน: G${r.g} ${r.id} (${r.name}) ${b.total} → ${r.total}`);
  if (b.status === "ok" && r.status !== "ok") diffs.push(`🔴 พัง: G${r.g} ${r.id} ${b.status}→${r.status} ${r.note || ""}`);
  if (b.status !== "ok" && r.status === "ok") diffs.push(`🟢 ซ่อมแล้ว: G${r.g} ${r.id} ${b.status}→ok total=${r.total}`);
}
for (const b of base.rows) if (!cmap.has(b.key)) diffs.push(`🔴 หายไป: G${b.g} ${b.id} (${b.name}) เคย total=${b.total}`);

console.log(`Golden snapshot: ${rows.length} สินค้า · จับยอดได้ ${ok.length} · ข้าม ${skipped.length}`);
if (!diffs.length) { console.log("✅ ไม่มีความเปลี่ยนแปลง — ยอดทุกตัวตรง baseline (ปลอดภัย)"); process.exit(0); }
console.log(`\n⚠ พบ ${diffs.length} จุดต่างจาก baseline:`);
diffs.forEach(d => console.log("  " + d));
console.log("\n→ ถ้าตั้งใจแก้ตัวที่เปลี่ยน: ตรวจว่าตัวอื่นไม่ขยับ แล้ว node scripts/golden-snapshot.mjs --save อัป baseline ใหม่");
process.exit(1);
