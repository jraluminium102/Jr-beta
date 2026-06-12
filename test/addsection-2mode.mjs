// addflow R2 (b15641d) verify — quickstrip ชิปของใช้บ่อย (โชว์ตลอด) + "＋ เพิ่มส่วน" = เพิ่มการ์ดทันที (1 tap · ไม่มี panel)
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

// มติพี่นัท 2026-06-12: ชิปเพิ่มด่วนใหม่ 5 ตัว (กระจกติดตาย·ประตูบานเปิด·บานกระทุ้ง·ผนังเบาภายนอก·ผนังเบาภายใน)
const EXPECT = [
  { id: "fixed_glass", g: "1" }, { id: "casement_euro", g: "1" }, { id: "awning_euro", g: "1" },
  { id: "wall_ext", g: "3" }, { id: "wall_int", g: "3" },
];

// ===== สร้างชุด — quickstrip โชว์ทันที =====
w.addSet();
const boxes = doc.querySelectorAll("#items .setbox");
const sb = boxes[boxes.length - 1];
const strip = sb.querySelector(".addsec-quickstrip");
want("ชุดมี quickstrip (โชว์ตลอด)", !!strip && strip.style.display !== "none");
want("quickstrip มีชิป 5 รายการ", strip && strip.querySelectorAll(".addsec-chip").length === 5, strip && strip.querySelectorAll(".addsec-chip").length);
const btn = sb.querySelector(".set-addpart");
want("ชุดมีปุ่ม ＋ เพิ่มส่วน", !!btn && /เพิ่มส่วน/.test(btn.textContent), btn && btn.textContent);

// ===== กดแต่ละชิป → การ์ดถูก product + กลุ่ม + ราคา>0 =====
for (const ex of EXPECT) {
  const chip = sb.querySelector('.addsec-chip[data-id="' + ex.id + '"]');
  const before = sb.querySelectorAll(".ch").length;
  chip.click();
  const cards = sb.querySelectorAll(".ch");
  const card = cards[cards.length - 1];
  want("ชิป " + ex.id + " → +1 การ์ด (กดทันที)", cards.length === before + 1);
  sf(card, ".i-w", "2.0"); sf(card, ".i-h", "2.0");
  const it = w.readItem(card);
  want("ชิป " + ex.id + ": product+กลุ่มถูก", it.p.id === ex.id && card.querySelector(".i-group").value === ex.g, "id=" + it.p.id + " g=" + card.querySelector(".i-group").value);
  want("ชิป " + ex.id + ": ราคา>0", it.r.sell > 0, "sell=" + it.r.sell);
}

// ===== quick-add ราคา = กดเอง =====
function manualCard(parts, g, id, wv, hv) {
  w.addItem(parts);
  const cs = parts.querySelectorAll(".ch"); const c = cs[cs.length - 1];
  sf(c, ".i-group", g); const ps = c.querySelector(".i-prod"); ps.innerHTML = w.prodOptionsG6(g); sf(c, ".i-prod", id);
  sf(c, ".i-w", wv); sf(c, ".i-h", hv);
  return w.readItem(c).r.sell;
}
const parts = sb.querySelector(".set-parts");
const manualFixed = manualCard(parts, "1", "fixed_glass", "2.0", "2.0");
const quickFixed = w.readItem(sb.querySelectorAll(".ch")[1]).r.sell; // การ์ด fixed_glass จากชิป (index 1 หลัง default)
want("quick-add ราคา = กดเอง (fixed_glass 2×2)", quickFixed === manualFixed && quickFixed > 0, "quick=" + quickFixed + " manual=" + manualFixed);

// ===== ＋ เพิ่มส่วน (non-GH) → เพิ่มการ์ดทันที (ไม่มี panel) =====
const cntG = sb.querySelectorAll(".ch").length;
btn.click();
want("＋ เพิ่มส่วน → +1 การ์ดทันที (ไม่มี panel)", sb.querySelectorAll(".ch").length === cntG + 1 && !sb.querySelector(".addsec-panel"));

// ===== GH set: quickstrip ซ่อน · ＋ เพิ่มบาน เพิ่ม group6 =====
w.addSet();
const boxes2 = doc.querySelectorAll("#items .setbox");
const ghBox = boxes2[boxes2.length - 1];
sf(ghBox.querySelector(".ch"), ".i-group", "6");
if (w.refreshSet) w.refreshSet(ghBox);
const ghStrip = ghBox.querySelector(".addsec-quickstrip");
want("GH: quickstrip ซ่อน", ghStrip && ghStrip.style.display === "none");
const ghBtn = ghBox.querySelector(".set-addpart");
want("GH: ปุ่มเป็น '＋ เพิ่มบาน'", /เพิ่มบาน/.test(ghBtn.textContent), ghBtn.textContent);
const ghCnt = ghBox.querySelectorAll(".ch").length;
ghBtn.click();
want("GH: เพิ่มการ์ด group 6", ghBox.querySelectorAll(".ch").length === ghCnt + 1 && ghBox.querySelectorAll(".ch")[ghCnt].querySelector(".i-group").value === "6");

want("ไม่มี JS error", errors.length === 0, errors.slice(0, 2).join(" / "));

let pass = 0;
console.log("\n=== addflow R2 (quickstrip + เพิ่มส่วนทันที) ===");
for (const c of checks) { console.log((c.ok ? "  ✓ " : "  ✗ ") + c.n + (c.d ? "  [" + c.d + "]" : "")); if (c.ok) pass++; }
console.log("\nสรุป: ผ่าน " + pass + "/" + checks.length);
process.exit(pass === checks.length ? 0 : 1);
