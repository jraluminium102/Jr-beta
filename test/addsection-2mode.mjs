// SPEC-addsection-2mode verify — flow "+ เพิ่มส่วน" แบนชั้นเดียว (ชิป 8 + ปุ่มทั่วไป)
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
function sf(ch, sel, v) { const e = ch.querySelector(sel); if (!e) throw new Error("no " + sel); e.value = String(v); e.dispatchEvent(new w.Event("input", { bubbles: true })); e.dispatchEvent(new w.Event("change", { bubbles: true })); return e; }

const EXPECT = [
  { id: "fixed_glass", g: "1" }, { id: "rn89", g: "1" }, { id: "rn90", g: "1" },
  { id: "rn91", g: "1" }, { id: "rn92", g: "1" },
  { id: "isowall", g: "3" }, { id: "wall_ext", g: "3" }, { id: "wall_int", g: "3" },
];

// ===== สร้างชุด + เปิด panel =====
w.addSet();
const box = doc.querySelectorAll("#items .setbox");
const sb = box[box.length - 1];
const btn = sb.querySelector(".set-addpart");
want("ชุดมีปุ่ม + เพิ่มส่วน", !!btn && /เพิ่มส่วน/.test(btn.textContent), btn && btn.textContent);
const before = sb.querySelectorAll(".ch").length; // 1 การ์ด auto ตอนสร้างชุด

btn.click();
const panel = sb.querySelector(".addsec-panel");
want("กดเพิ่มส่วน → โผล่ panel", !!panel);
want("panel มีชิป 8 รายการ", panel && panel.querySelectorAll(".addsec-chip").length === 8, panel && panel.querySelectorAll(".addsec-chip").length);
want("panel มีปุ่มงานบานทั่วไป 1 ปุ่ม", panel && !!panel.querySelector(".addsec-general"));
want("เปิด panel ยังไม่เพิ่มการ์ด (เห็นก่อนเลือก)", sb.querySelectorAll(".ch").length === before, "ch=" + sb.querySelectorAll(".ch").length);

// toggle ปิด
btn.click();
want("กดซ้ำ → panel ปิด (toggle)", !sb.querySelector(".addsec-panel"));

// ===== กดแต่ละชิป → การ์ดถูก product + กลุ่ม + ราคา > 0 =====
for (const ex of EXPECT) {
  btn.click(); // open
  const p = sb.querySelector(".addsec-panel");
  const chip = p.querySelector('.addsec-chip[data-id="' + ex.id + '"]');
  const cntBefore = sb.querySelectorAll(".ch").length;
  chip.click();
  const cards = sb.querySelectorAll(".ch");
  const card = cards[cards.length - 1];
  want("ชิป " + ex.id + " → +1 การ์ด + panel ปิด", cards.length === cntBefore + 1 && !sb.querySelector(".addsec-panel"));
  // set ขนาด → อ่าน product/กลุ่ม/ราคา
  sf(card, ".i-w", "2.0"); sf(card, ".i-h", "2.0");
  const it = w.readItem(card);
  want("ชิป " + ex.id + ": product ถูก (" + ex.id + ") กลุ่ม " + ex.g, it.p.id === ex.id && card.querySelector(".i-group").value === ex.g, "id=" + it.p.id + " g=" + card.querySelector(".i-group").value);
  want("ชิป " + ex.id + ": ราคา > 0", it.r.sell > 0, "sell=" + it.r.sell);
}

// ===== quick-add ราคา = กดเอง (เทียบ fixed_glass) =====
// quick-add fixed_glass แล้ว เทียบกับ การ์ดที่ set เองด้วยมือ
function manualCard(parts, g, id, wv, hv) {
  w.addItem(parts);
  const cs = parts.querySelectorAll(".ch"); const c = cs[cs.length - 1];
  sf(c, ".i-group", g); const ps = c.querySelector(".i-prod"); ps.innerHTML = w.prodOptionsG6(g); sf(c, ".i-prod", id);
  sf(c, ".i-w", wv); sf(c, ".i-h", hv);
  return w.readItem(c).r.sell;
}
const parts = sb.querySelector(".set-parts");
const manualFixed = manualCard(parts, "1", "fixed_glass", "2.0", "2.0");
// quick fixed_glass การ์ดแรก (index before, ตั้ง 2x2 ไปแล้ว)
const quickFixed = w.readItem(sb.querySelectorAll(".ch")[before]).r.sell;
want("quick-add ราคา = กดเอง (fixed_glass 2×2)", quickFixed === manualFixed && quickFixed > 0, "quick=" + quickFixed + " manual=" + manualFixed);

// ===== ปุ่มงานบานทั่วไป → addItem เดิม (default บานเลื่อน) =====
btn.click();
const cntG = sb.querySelectorAll(".ch").length;
sb.querySelector(".addsec-panel .addsec-general").click();
const cardsG = sb.querySelectorAll(".ch");
want("ทั่วไป → +1 การ์ด (flow เดิม)", cardsG.length === cntG + 1 && !sb.querySelector(".addsec-panel"));
want("ทั่วไป → การ์ด default กลุ่ม 1", cardsG[cardsG.length - 1].querySelector(".i-group").value === "1");

// ===== GH "+ เพิ่มบาน" ไม่กระทบ (ไม่โผล่ panel · เพิ่ม group6) =====
w.addSet();
const boxes2 = doc.querySelectorAll("#items .setbox");
const ghBox = boxes2[boxes2.length - 1];
const ghFirst = ghBox.querySelector(".ch");
sf(ghFirst, ".i-group", "6"); // ทำให้ hasGH
if (w.refreshSet) w.refreshSet(ghBox);
const ghBtn = ghBox.querySelector(".set-addpart");
want("GH: ปุ่มเป็น '+ เพิ่มบาน'", /เพิ่มบาน/.test(ghBtn.textContent), ghBtn.textContent);
const ghCnt = ghBox.querySelectorAll(".ch").length;
ghBtn.click();
want("GH: กดแล้วไม่โผล่ panel (คงเดิม)", !ghBox.querySelector(".addsec-panel"));
want("GH: กดแล้วเพิ่มการ์ด group 6 ทันที", ghBox.querySelectorAll(".ch").length === ghCnt + 1 && ghBox.querySelectorAll(".ch")[ghCnt].querySelector(".i-group").value === "6");

want("ไม่มี JS error", errors.length === 0, errors.slice(0, 2).join(" / "));

let pass = 0;
console.log("\n=== SPEC-addsection-2mode (flow + เพิ่มส่วน) ===");
for (const c of checks) { console.log((c.ok ? "  ✓ " : "  ✗ ") + c.n + (c.d ? "  [" + c.d + "]" : "")); if (c.ok) pass++; }
console.log("\nสรุป: ผ่าน " + pass + "/" + checks.length);
process.exit(pass === checks.length ? 0 : 1);
