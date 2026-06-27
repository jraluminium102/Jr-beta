// render-smoke.mjs — ตาข่ายเฝ้า "เวที" (R-C6): จับสาเหตุ C ที่ golden มองไม่เห็น
//   golden รัน engine ตรงๆ ไม่ผ่าน DOM → จับ "ราคาเพี้ยน" ได้ แต่จับ "render/ของค้าง/สลับกลุ่มพัง" ไม่ได้
//   ตัวนี้: addItem → สลับครบ 7 กลุ่มไป-กลับ → assert ไม่ throw · readItem/calcQuote ไม่พัง · ไม่มี orphan · ช่องขนาดไม่หาย
// ใช้:  node scripts/render-smoke.mjs   (exit 0 = ผ่าน · exit 1 = เจอ render พัง)
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const html = readFileSync(join(ROOT, "public/calculator/index.html"), "utf8");
const vc = new VirtualConsole();
let jsErrors = [];
vc.on("jsdomError", (e) => { if (!/scrollTo|Not implemented|getContext/i.test(e.message)) jsErrors.push(e.message); });
const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc, url: "http://localhost/calculator/index.html" });
await new Promise((r) => { if (dom.window.document.readyState === "complete") r(); else dom.window.addEventListener("load", r); setTimeout(r, 2500); });
const w = dom.window, doc = w.document;
const fire = (el, t) => el.dispatchEvent(new w.Event(t, { bubbles: true }));
// เดิน ancestor หา display:none เอง (offsetParent ใน jsdom = 0 ทุกตัว)
function vis(el) { let n = el; while (n && n !== doc.body) { if (n.style && n.style.display === "none") return false; n = n.parentElement; } return true; }

const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };
function freshItem() { doc.getElementById("items").innerHTML = ""; w.addItem(doc.getElementById("items")); return doc.querySelector("#items .ch"); }
function firstProd(ch) { const ps = ch.querySelector(".i-prod"); if (ps && ps.options.length > 1) { ps.value = ps.options[1].value; fire(ps, "change"); } return ps; }
function setGroup(ch, g) { const gs = ch.querySelector(".i-group"); if (gs) { gs.value = String(g); fire(gs, "change"); } }

const GROUPS = [1, 2, 3, 4, 5, 6, 7];

// ===== Scenario 1: สลับครบ 7 กลุ่ม ไป-กลับ ในไอเทมเดียว → ไม่ throw / readItem-calcQuote ไม่พัง (จับ C4) =====
{
  const ch = freshItem();
  const seq = [...GROUPS, ...[...GROUPS].reverse()]; // 1..7 แล้ว 7..1
  for (const g of seq) {
    const e0 = jsErrors.length;
    setGroup(ch, g);
    firstProd(ch);
    try { w.readItem && w.readItem(ch); } catch (e) { fails.push(`S1 readItem throw หลังสลับ G${g}: ${e.message}`); }
    try { w.calcQuote && w.calcQuote(); } catch (e) { fails.push(`S1 calcQuote throw หลังสลับ G${g}: ${e.message}`); }
    if (jsErrors.length > e0) fails.push(`S1 JS error ตอนสลับ G${g}: ${jsErrors.slice(e0).join(" | ").slice(0, 120)}`);
  }
}

// ===== Scenario 2: หลังคา(G3) → สลับออกไปกลุ่มอื่น → ช่องขนาดต้องไม่หาย + ไม่มี rf-spans-wrap ค้าง (จับ C2/C3 · บั๊ก 6b6a47b) =====
for (const g of [1, 2, 4, 5, 7]) {
  const ch = freshItem();
  setGroup(ch, 3); firstProd(ch);                 // เข้าหลังคา (ซ่อน size-row + สร้าง rf-spans-wrap)
  setGroup(ch, g); firstProd(ch);                  // สลับออก
  const sr = ch.querySelector(".size-row");
  ok(!sr || vis(sr), `S2 ช่องกว้าง/สูง(.size-row)หายค้าง หลังหลังคา→G${g}`);
  ok(!ch.querySelector(".rf-spans-wrap"), `S2 rf-spans-wrap orphan ค้าง หลังหลังคา→G${g}`);
}

// ===== Scenario 3: orphan ข้ามกลุ่ม — วนทุกกลุ่มแล้วจบที่ G1 ต้องไม่มี element เฉพาะกลุ่มอื่นค้าง (จับ C2) =====
{
  const ch = freshItem();
  // element เหล่านี้เป็น "ของเฉพาะกลุ่มอื่น" (ไม่ใช่ G1) → จบที่ G1 ต้องไม่เหลือ/ไม่ถูกแสดง
  const crossGroupOrphan = [
    { sel: ".rf-spans-wrap", of: "หลังคา G3" },
    { sel: ".g6r-room-area", of: "กั้นห้อง G6" },
    { sel: ".gh-set-color-row", of: "สีหัวห้อง G6" },
  ];
  for (const g of GROUPS) { setGroup(ch, g); firstProd(ch); } // วนเข้าทุกกลุ่ม
  setGroup(ch, 1); firstProd(ch);                              // จบที่ G1
  for (const o of crossGroupOrphan) {
    const el = ch.querySelector(o.sel);
    ok(!el || !vis(el), `S3 ${o.sel} (${o.of}) ค้าง/ยังแสดง หลังวนจบที่ G1`);
  }
  const sr = ch.querySelector(".size-row");
  ok(!sr || vis(sr), `S3 .size-row ไม่กลับมาแสดงเมื่อจบที่ G1`);
}

// ===== รายงาน =====
console.log(`render-smoke: ${GROUPS.length} กลุ่ม · สลับไป-กลับ + หลังคา-orphan + cycle`);
if (jsErrors.length) console.log(`  (JS errors สะสมรวม ${jsErrors.length} — ดูใน fails ถ้าเกี่ยว)`);
if (!fails.length) { console.log("✅ ผ่าน — ไม่มี render พัง/ของค้าง/crash สลับกลุ่ม"); process.exit(0); }
console.log(`\n⚠ พบ ${fails.length} จุด render พัง:`);
fails.forEach(f => console.log("  🔴 " + f));
process.exit(1);
