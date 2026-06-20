// golden-options.mjs — ตาข่ายชั้น 2: เทส "ออปชั่นเปิด" (golden เดิมเทสแต่ base เปล่า = map ออปชั่นพังก็ผ่าน)
// ปิดรูโหว่: (1) full mode ติ๊กออปชั่นจริงทุกตัวที่สินค้ามี · (2) คิดเร็ว G1 ออปชั่นเดียวกัน เทียบว่าตรง 2 โหมด
// ใช้:
//   node scripts/golden-options.mjs --save   → บันทึก baseline (scripts/golden-options-baseline.json) ตอนของยังดี
//   node scripts/golden-options.mjs          → เทียบ baseline · ยอดไหนขยับ = เด้งแดง · exit 1
//
// แนวคิดเดียวกับ golden-snapshot.mjs (ตัวเลขไม่สำคัญ ขอ "เสถียร") แต่เน้น "ออปชั่นถูกป้อนเข้าสูตรเหมือนเดิม"
// → จับ regression ตอนรวม buildOptSel / แก้ตัวอ่านออปชั่น (อาการ "แก้โหมดนึง อีกโหมดพัง")
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const HTML_PATH = join(ROOT, "public/calculator/index.html");
const BASELINE = join(__dirname, "golden-options-baseline.json");
const SAVE = process.argv.includes("--save");

// ===== boot JSDOM (เหมือน golden-snapshot) =====
const html = readFileSync(HTML_PATH, "utf8");
const vc = new VirtualConsole();
let jsErrors = [];
vc.on("jsdomError", (e) => { if (!/scrollTo|Not implemented/i.test(e.message)) jsErrors.push(e.message); });
const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc, url: "http://localhost/calculator/index.html" });
await new Promise((r) => { if (dom.window.document.readyState === "complete") r(); else dom.window.addEventListener("load", r); setTimeout(r, 2000); });
const w = dom.window, doc = w.document;
const fire = (el, t) => el.dispatchEvent(new w.Event(t, { bubbles: true }));
const setVal = (root, sel, v) => { const e = root.querySelector(sel); if (e) { e.value = v; fire(e, "input"); fire(e, "change"); } return !!e; };

function noSvc() { ["svc-protect","svc-lift","svc-travel","svc-ship"].forEach(id => { const e = doc.getElementById(id); if (e && e.checked) { e.checked = false; fire(e, "change"); } }); }
function grandFull() {
  noSvc();
  try { w.calcQuote && w.calcQuote(); w.genQuote && w.genQuote(); } catch (e) { return { v: NaN, err: "calc:" + e.message }; }
  const g = doc.querySelector("#quoteContent .qtot .g");
  if (g) return { v: parseInt((g.textContent || "").replace(/\.\d+/g, "").replace(/[^\d]/g, ""), 10) };
  const m = (doc.getElementById("quoteContent") || {}).innerHTML;
  const mm = m && m.match(/รวมเป็นเงิน(?:<\/span>)*<span>([\d,\.]+)/);
  return { v: mm ? parseFloat(mm[1].replace(/,/g, "")) : NaN };
}

const SIZE = { 1:[1.5,2.0], 2:[2.0,1.5], 3:[4.0,3.0], 4:[1.0,2.0], 5:[1.0,2.0], 7:[2.0,2.5] };
const GROUPS = [1, 2, 3, 4, 5, 7]; // ตัด G6 (room-builder · มี test แยก) เหมือน golden เดิม

// ---------- FULL MODE ----------
function newFullCh(g, id) {
  doc.getElementById("items").innerHTML = "";
  try { w.addItem(doc.getElementById("items")); } catch (e) { return null; }
  const ch = doc.querySelector("#items .ch"); if (!ch) return null;
  const gs = ch.querySelector(".i-group"); if (gs) { gs.value = String(g); fire(gs, "change"); }
  const ps = ch.querySelector(".i-prod");
  if (!ps || !ps.querySelector('option[value="' + id + '"]')) return null;
  ps.value = id; fire(ps, "change");
  const [W, H] = SIZE[g] || [1.5, 2.0];
  setVal(ch, ".i-w", String(W)); setVal(ch, ".i-h", String(H));
  return ch;
}
function prodsInGroup(g) {
  doc.getElementById("items").innerHTML = "";
  try { w.addItem(doc.getElementById("items")); } catch (e) { return []; }
  const ch = doc.querySelector("#items .ch"); if (!ch) return [];
  const gs = ch.querySelector(".i-group"); if (gs) { gs.value = String(g); fire(gs, "change"); }
  const ps = ch.querySelector(".i-prod"); if (!ps) return [];
  return Array.from(ps.options).map(o => o.value).filter(Boolean);
}

// ออปชั่น full mode = auto-discover (มี control ตัวนี้บนสินค้านี้ไหม) แล้วเปิด → ไม่ต้อง hardcode รายสินค้า
const FULL_VARIANTS = [
  { tag: "grid",     test: ch => ch.querySelector(".o-gridmark"),
    apply: ch => { const g = ch.querySelector(".o-gridmark"); g.checked = true; fire(g, "change"); setVal(ch, ".o-gm-nh", "2"); setVal(ch, ".o-gm-nv", "2"); } },
  { tag: "solid",    test: ch => ch.querySelector(".o-solidlower"),
    apply: ch => { const s = ch.querySelector(".o-solidlower"); const o = [...s.options].find(x => x.value && x.value !== "none" && x.value !== ""); if (o) { s.value = o.value; fire(s, "change"); } } },
  { tag: "thresh",   test: ch => ch.querySelector(".o-thresh"),
    apply: ch => { const t = ch.querySelector(".o-thresh"); const o = [...t.options].find(x => /turtle|เต่า/i.test(x.value)); if (o) { t.value = o.value; fire(t, "change"); } } },
  { tag: "fullgrid", test: ch => ch.querySelector(".o-fullgrid"),
    apply: ch => { const f = ch.querySelector(".o-fullgrid"); f.checked = true; fire(f, "change"); } },
  { tag: "trackhide",test: ch => ch.querySelector(".o-track"),
    apply: ch => { const t = ch.querySelector(".o-track"); const o = [...t.options].find(x => /ซ่อน/.test(x.value)); if (o) { t.value = o.value; fire(t, "change"); } } },
  { tag: "closer",   test: ch => ch.querySelector(".o-closer"),
    apply: ch => { const c = ch.querySelector(".o-closer"); const o = [...c.options].find(x => x.value && x.value !== "0"); if (o) { c.value = o.value; fire(c, "change"); } } },
];

// ---------- QUICK MODE (G1 เท่านั้น — G2-7 เป็น chip-cascade ขับ headless ยาก · เป็น known gap) ----------
function newQuickG1(id) {
  doc.getElementById("q-items").innerHTML = "";
  try { w.addQuickItem(); } catch (e) { return null; }
  const d = doc.querySelector("#q-items .ch"); if (!d) return null;
  const gs = d.querySelector(".qi-group"); if (gs) { gs.value = "1"; fire(gs, "change"); }
  const ps = d.querySelector(".qi-prod");
  if (!ps || !ps.querySelector('option[value="' + id + '"]')) return null;
  ps.value = id; fire(ps, "change");
  const [W, H] = SIZE[1];
  setVal(d, ".qi-w", String(W)); setVal(d, ".qi-h", String(H));
  return d;
}
function quickTotal(d) {
  try { w.calcQuickAll(); } catch (e) { return { v: NaN, err: e.message }; }
  const p = d.querySelector(".qi-price"); if (!p) return { v: NaN };
  return { v: parseInt((p.textContent || "").replace(/[^\d]/g, ""), 10) };
}
const QUICK_VARIANTS = [
  { tag: "base", test: () => true, apply: () => {} },
  { tag: "grid", test: d => d.querySelector(".qi-gridmark"),
    apply: d => { const g = d.querySelector(".qi-gridmark"); g.value = "1"; fire(g, "change"); setVal(d, ".qi-gnh", "2"); setVal(d, ".qi-gnv", "2"); } },
  { tag: "solid", test: d => d.querySelector(".qi-solidlower"),
    apply: d => { const s = d.querySelector(".qi-solidlower"); s.value = "corrugated"; fire(s, "change"); setVal(d, ".qi-slw", String(SIZE[1][0])); setVal(d, ".qi-slh", String(SIZE[1][1])); } },
];

// ===== run =====
const rows = [];
// FULL: ทุกกลุ่ม × ทุกสินค้า × variant ที่มี control จริง
for (const g of GROUPS) {
  for (const id of prodsInGroup(g)) {
    let ch = newFullCh(g, id); if (!ch) continue;
    for (const v of FULL_VARIANTS) {
      if (!v.test(ch)) continue;
      ch = newFullCh(g, id); if (!ch) break;        // render สดต่อ variant (กัน state ค้าง)
      const e0 = jsErrors.length;
      try { v.apply(ch); } catch (e) {}
      const r = grandFull();
      const err = jsErrors.length > e0 || r.err;
      rows.push({ key: `F:${g}:${id}:${v.tag}`, total: Number.isFinite(r.v) ? r.v : null, status: err ? "js-error" : "ok", note: (r.err || jsErrors.slice(e0).join(" | ")).slice(0, 120) });
    }
    jsErrors = jsErrors.slice(-50);
  }
}
// QUICK G1
for (const id of prodsInGroup(1)) {
  let d = newQuickG1(id); if (!d) continue;
  for (const v of QUICK_VARIANTS) {
    if (!v.test(d)) continue;
    d = newQuickG1(id); if (!d) break;
    const e0 = jsErrors.length;
    try { v.apply(d); } catch (e) {}
    const r = quickTotal(d);
    const err = jsErrors.length > e0 || r.err;
    rows.push({ key: `Q1:${id}:${v.tag}`, total: Number.isFinite(r.v) ? r.v : null, status: err ? "js-error" : "ok", note: (r.err || jsErrors.slice(e0).join(" | ")).slice(0, 120) });
  }
  jsErrors = jsErrors.slice(-50);
}

const ok = rows.filter(r => r.status === "ok");
const bad = rows.filter(r => r.status !== "ok");

if (SAVE) {
  writeFileSync(BASELINE, JSON.stringify({ meta: { at: "baseline", cases: rows.length, ok: ok.length, bad: bad.length }, rows }, null, 1), "utf8");
  console.log(`✅ บันทึก baseline ออปชั่น: ${rows.length} เคส (full ติ๊กออปชั่น + คิดเร็ว G1) · ok ${ok.length} · error ${bad.length}`);
  if (bad.length) console.log("   error:", bad.slice(0, 20).map(r => r.key + " " + r.note).join("\n   "));
  process.exit(0);
}

if (!existsSync(BASELINE)) { console.error("❌ ยังไม่มี baseline — รัน: node scripts/golden-options.mjs --save ก่อน"); process.exit(2); }
const base = JSON.parse(readFileSync(BASELINE, "utf8"));
const bmap = new Map(base.rows.map(r => [r.key, r]));
const cmap = new Map(rows.map(r => [r.key, r]));
const diffs = [];
for (const r of rows) {
  const b = bmap.get(r.key);
  if (!b) { diffs.push(`🟢 ใหม่: ${r.key} total=${r.total} [${r.status}]`); continue; }
  if (b.total !== r.total) diffs.push(`🟡 ยอดเปลี่ยน: ${r.key} ${b.total} → ${r.total}`);
  if (b.status === "ok" && r.status !== "ok") diffs.push(`🔴 พัง: ${r.key} ok→${r.status} ${r.note || ""}`);
  if (b.status !== "ok" && r.status === "ok") diffs.push(`🟢 ซ่อมแล้ว: ${r.key} →ok total=${r.total}`);
}
for (const b of base.rows) if (!cmap.has(b.key)) diffs.push(`🔴 หายไป: ${b.key} เคย total=${b.total}`);

console.log(`Golden options: ${rows.length} เคส · ok ${ok.length} · error ${bad.length}`);
if (!diffs.length) { console.log("✅ ออปชั่นทุกเคสตรง baseline (ป้อนเข้าสูตรเหมือนเดิม · ปลอดภัย)"); process.exit(0); }
console.log(`\n⚠ พบ ${diffs.length} จุดต่างจาก baseline:`);
diffs.forEach(d => console.log("  " + d));
console.log("\n→ ถ้าตั้งใจแก้: ตรวจว่าตัวอื่นไม่ขยับ แล้ว node scripts/golden-options.mjs --save");
process.exit(1);
