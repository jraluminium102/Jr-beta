// order-snapshot.mjs — ตาข่ายชั้น 3: ล็อก "ลำดับฟีเจอร์" (กล่องหมวดออปชั่นในฟอร์ม)
// golden-snapshot/options คุม "ราคา" · ตัวนี้คุม "ลำดับหมวด" — สลับลำดับผิด/แก้กลุ่มนึงแล้วอีกกลุ่มลำดับเพี้ยน = เด้งแดง
// ใช้:
//   node scripts/order-snapshot.mjs --save   → บันทึก baseline (scripts/order-baseline.json) = ล็อกลำดับปัจจุบัน
//   node scripts/order-snapshot.mjs          → เทียบ baseline · ลำดับกลุ่มไหนเปลี่ยน = เด้งแดง · exit 1
//   node scripts/order-snapshot.mjs --save 2 → ล็อกใหม่เฉพาะกลุ่ม 2 (กลุ่มอื่นคงเดิม) · ใช้ตอนตั้งใจจัดลำดับกลุ่มนั้น
//
// อ่านลำดับจาก .i-opts .gh-opt-cat-det (groupGHOpts จัดเรียงตอน buildItemOpts) · ตัด "(จำนวน)" ออก (กัน false diff)
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const HTML_PATH = join(ROOT, "public/calculator/index.html");
const BASELINE = join(__dirname, "order-baseline.json");
const SAVE = process.argv.includes("--save");
const SAVE_ONLY_GROUP = (() => { const i = process.argv.indexOf("--save"); const v = i >= 0 ? process.argv[i + 1] : null; return v && /^[1-7]$/.test(v) ? v : null; })();

const html = readFileSync(HTML_PATH, "utf8");
const vc = new VirtualConsole();
vc.on("jsdomError", () => {});
const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc, url: "http://localhost/calculator/index.html" });
await new Promise((r) => { if (dom.window.document.readyState === "complete") r(); else dom.window.addEventListener("load", r); setTimeout(r, 2000); });
const w = dom.window, doc = w.document;
const fire = (el, t) => el.dispatchEvent(new w.Event(t, { bubbles: true }));

const SIZE = { 1:[1.5,2.0], 2:[2.0,1.5], 3:[4.0,3.0], 4:[1.0,2.0], 5:[1.0,2.0], 7:[2.0,2.5] };
const GROUPS = [1, 2, 3, 4, 5, 7]; // ตัด G6 (room builder · ไม่ใช้ groupGHOpts)

function prodsInGroup(g) {
  doc.getElementById("items").innerHTML = "";
  try { w.addItem(doc.getElementById("items")); } catch (e) { return []; }
  const ch = doc.querySelector("#items .ch"); if (!ch) return [];
  const gs = ch.querySelector(".i-group"); if (gs) { gs.value = String(g); fire(gs, "change"); }
  const ps = ch.querySelector(".i-prod"); if (!ps) return [];
  return Array.from(ps.options).map(o => o.value).filter(Boolean);
}
// ติ๊กออปชั่นที่มี → หมวดโผล่ครบ จะได้ล็อกลำดับเต็ม (ไม่ใช่แค่หมวดที่บังเอิญมีของตอน base)
function populate(ch) {
  const chk = (s) => { const e = ch.querySelector(s); if (e && !e.checked) { e.checked = true; fire(e, "change"); } };
  const pick = (s, re) => { const e = ch.querySelector(s); if (e) { const o = [...e.options].find(x => x.value && x.value !== "0" && x.value !== "" && x.value !== "none" && (!re || re.test(x.value))); if (o) { e.value = o.value; fire(e, "change"); } } };
  chk(".o-gridmark"); chk(".o-fullgrid");
  pick(".o-solidlower"); pick(".o-thresh"); pick(".o-track", /ซ่อน/); pick(".o-closer");
}
// อ่านลำดับหมวด (ตัด "(N)" ท้าย) ของสินค้า 1 ตัว
function orderOf(g, id) {
  doc.getElementById("items").innerHTML = "";
  try { w.addItem(doc.getElementById("items")); } catch (e) { return null; }
  const ch = doc.querySelector("#items .ch"); if (!ch) return null;
  const gs = ch.querySelector(".i-group"); if (gs) { gs.value = String(g); fire(gs, "change"); }
  const ps = ch.querySelector(".i-prod");
  if (!ps || !ps.querySelector('option[value="' + id + '"]')) return null;
  ps.value = id; fire(ps, "change");
  const [W, H] = SIZE[g] || [1.5, 2.0];
  const wi = ch.querySelector(".i-w"), hi = ch.querySelector(".i-h");
  if (wi) { wi.value = String(W); fire(wi, "input"); fire(wi, "change"); }
  if (hi) { hi.value = String(H); fire(hi, "input"); fire(hi, "change"); }
  try { populate(ch); } catch (e) {}
  return Array.from(ch.querySelectorAll(".i-opts .gh-opt-cat-det > summary"))
    .map(s => (s.textContent || "").replace(/฿[\d,.]*/g, "").replace(/\s*\(\d+\)\s*/g, " ").trim()) // ตัดราคา(฿)+จำนวน(N) เหลือแค่ชื่อหมวด
    .filter(Boolean);
}

const rows = {};
for (const g of GROUPS) for (const id of prodsInGroup(g)) {
  const ord = orderOf(g, id);
  if (ord) rows[`${g}:${id}`] = ord;
}
const nCats = Object.values(rows).reduce((a, o) => a + o.length, 0);

if (SAVE) {
  let out = { meta: { at: "baseline", products: Object.keys(rows).length }, rows };
  if (SAVE_ONLY_GROUP && existsSync(BASELINE)) {
    // ล็อกใหม่เฉพาะกลุ่มที่ระบุ — กลุ่มอื่นคงลำดับเดิมใน baseline
    const old = JSON.parse(readFileSync(BASELINE, "utf8"));
    const merged = { ...old.rows };
    for (const k of Object.keys(merged)) if (k.startsWith(SAVE_ONLY_GROUP + ":")) delete merged[k];
    for (const k of Object.keys(rows)) if (k.startsWith(SAVE_ONLY_GROUP + ":")) merged[k] = rows[k];
    out = { meta: { at: "baseline", products: Object.keys(merged).length }, rows: merged };
    console.log(`✅ ล็อกลำดับใหม่เฉพาะกลุ่ม ${SAVE_ONLY_GROUP} · กลุ่มอื่นคงเดิม`);
  }
  writeFileSync(BASELINE, JSON.stringify(out, null, 1), "utf8");
  console.log(`✅ บันทึก baseline ลำดับ: ${Object.keys(out.rows).length} สินค้า · ${nCats} หมวดรวม (${BASELINE})`);
  process.exit(0);
}

if (!existsSync(BASELINE)) { console.error("❌ ยังไม่มี baseline — รัน: node scripts/order-snapshot.mjs --save ก่อน"); process.exit(2); }
const base = JSON.parse(readFileSync(BASELINE, "utf8"));
const diffs = [];
const eq = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
for (const k of Object.keys(rows)) {
  const b = base.rows[k];
  if (!b) { diffs.push(`🟢 ใหม่: ${k} [${rows[k].join(" → ")}]`); continue; }
  if (!eq(b, rows[k])) diffs.push(`🟡 ลำดับเปลี่ยน: ${k}\n      เดิม: ${b.join(" → ")}\n      ใหม่: ${rows[k].join(" → ")}`);
}
for (const k of Object.keys(base.rows)) if (!rows[k]) diffs.push(`🔴 หายไป: ${k} (เคยมี ${base.rows[k].length} หมวด)`);

console.log(`Order snapshot: ${Object.keys(rows).length} สินค้า · ${nCats} หมวดรวม`);
if (!diffs.length) { console.log("✅ ลำดับฟีเจอร์ทุกกลุ่มตรง baseline (ล็อกอยู่ · ปลอดภัย)"); process.exit(0); }
console.log(`\n⚠ พบ ${diffs.length} กลุ่ม/สินค้า ลำดับต่างจาก baseline:`);
diffs.forEach(d => console.log("  " + d));
console.log("\n→ ถ้าตั้งใจจัดลำดับกลุ่มไหน: ตรวจกลุ่มอื่นไม่ขยับ แล้ว node scripts/order-snapshot.mjs --save <กลุ่ม>");
process.exit(1);
