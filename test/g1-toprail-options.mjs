// R3.9 ราคาออปชั่นบานรางบน — ซ่อนคาน/ซ่อนราง/รางยู/เสริมคานซัพพอร์ท คิดตามความยาว
// ซ่อนคาน·ซ่อนราง·เสริมคาน: ≤3ม.=4,000 · เกิน +500/ม. | รางยู: ≤2ม.=4,000 · เกิน +500/ม.
// เสริมคานซัพพอร์ท เฉพาะ เลื่อนภายใน + บานเฟี้ยม (เลิกรุ่น1/2/3 · บานเลื่อน/เปิด/PC ไม่มี)
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../public/calculator/index.html", import.meta.url), "utf8");
const vc = new VirtualConsole();
const errors = [];
vc.on("jsdomError", (e) => { if (!/Not implemented:|scrollIntoView|scrollTo/.test(e.message)) errors.push(e.message); });
const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc, url: "http://localhost/calculator/index.html" });
await new Promise((r) => { if (dom.window.document.readyState === "complete") r(); else dom.window.addEventListener("load", r); setTimeout(r, 1500); });
const w = dom.window, doc = w.document;

const checks = [];
const want = (n, ok, d) => checks.push({ n, ok: !!ok, d: d || "" });
function sf(d, s, v) { const e = d.querySelector(s); if (!e) return; e.value = String(v); e.dispatchEvent(new w.Event("change", { bubbles: true })); e.dispatchEvent(new w.Event("input", { bubbles: true })); }
function mk(prod) { w.addItem(); const chs = doc.querySelectorAll("#items .ch"); const d = chs[chs.length - 1]; sf(d, ".i-group", "1"); sf(d, ".i-prod", prod); sf(d, ".i-w", "3"); sf(d, ".i-h", "2.4"); return d; }
function checkbox(d, s) { const e = d.querySelector(s); if (e) { e.checked = true; e.dispatchEvent(new w.Event("change", { bubbles: true })); } return !!e; }
function optDelta(d, optClass, lenClass, len) { const base = w.readItem(d).r.sell; checkbox(d, optClass); if (lenClass) sf(d, lenClass, len); return w.readItem(d).r.sell - base; }

// ===== บานเฟี้ยม =====
const dF = mk("folding");
want("บานเฟี้ยม: มีเสริมคานซัพพอร์ท", !!dF.querySelector(".o-beam_support"));
want("บานเฟี้ยม: ไม่มี o-beamm (รุ่น1/2/3) เดิม", !dF.querySelector(".o-beamm"));
want("บานเฟี้ยม: ไม่มี o-beam (checkbox เดิม)", !dF.querySelector(".o-beam"));
// ซ่อนราง ≤3 (len=2) = 4,000
want("ซ่อนราง 2ม. = 4,000", optDelta(dF, ".o-hide_track", ".o-hide_track-len", "2") === 4000, "");
// เสริมคานซัพพอร์ท 5ม. = 4,000+(5-3)×500 = 5,000 (เพิ่มจาก state เดิมที่มีซ่อนราง 4,000 → +5,000)
{ const before = w.readItem(dF).r.sell; checkbox(dF, ".o-beam_support"); sf(dF, ".o-beam_support-len", "5"); want("เสริมคานซัพพอร์ท 5ม. = 5,000", w.readItem(dF).r.sell - before === 5000, "Δ=" + (w.readItem(dF).r.sell - before)); }

// ===== รางยู (เลื่อนภายใน) — ≤2ม.=4,000 · 4ม.=5,000 =====
const dI = mk("inner_top_slimlux");
want("เลื่อนภายใน: มีเสริมคานซัพพอร์ท", !!dI.querySelector(".o-beam_support"));
want("รางยู 4ม. = 5,000 (≤2=4,000 +500×2)", optDelta(dI, ".o-u_track", ".o-u_track-len", "4") === 5000, "");

// ===== ซ่อนคาน เกิน 3 (folding ใหม่) =====
const dF2 = mk("folding");
want("ซ่อนคาน 7ม. = 4,000+2,000 = 6,000", optDelta(dF2, ".o-hide_beam", ".o-hide_beam-len", "7") === 6000, "");

// ===== บานเลื่อน/บานเปิด/PC — ไม่มีเสริมคานแล้ว =====
const dS = mk("sliding_euro"), dC = mk("casement_euro"), dPC = mk("pc_door_2");
want("บานเลื่อน: ไม่มีเสริมคาน (เลิกรุ่น)", !dS.querySelector(".o-beam_support") && !dS.querySelector(".o-beamm"));
want("บานเปิด: ไม่มีเสริมคาน", !dC.querySelector(".o-beam_support") && !dC.querySelector(".o-beamm"));
want("PC Door: มีเสริมคานซัพพอร์ท (เดิมมี)", !!dPC.querySelector(".o-beam_support"));

// ===== ซ่อนราง (o-track รางบน) +5,000 — มติพี่นัท 2026-06-13 (เดิม label บอก +5,000 แต่ engine ไม่เคยบวก) =====
{
  const dT = mk("inner_top_stack");
  const before = w.readItem(dT).r.sell;
  sf(dT, ".o-track", "ซ่อนราง");
  const after = w.readItem(dT).r.sell;
  want("ซ่อนราง (รางบน) = +5,000 เป๊ะ", after - before === 5000, "Δ=" + (after - before));
  want("บานเลื่อนรางล่าง: ไม่มี o-track (ไม่โดน +5,000)", !dS.querySelector(".o-track"));
}

want("ไม่มี JS error", errors.length === 0, errors.slice(0, 2).join(" / "));

let pass = 0;
console.log("\n=== R3.9 ออปชั่นบานรางบน (ซ่อนคาน/ราง/รางยู/เสริมคาน) ===");
for (const c of checks) { console.log((c.ok ? "  ✓ " : "  ✗ ") + c.n + (c.d ? "  [" + c.d + "]" : "")); if (c.ok) pass++; }
console.log("\nสรุป: ผ่าน " + pass + "/" + checks.length);
process.exit(pass === checks.length ? 0 : 1);
