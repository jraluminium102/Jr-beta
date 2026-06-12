// HANDOFF-UX-ALL-G1-G6 + casement-euro-price verify — leak cuts + casement Linear + G4 บั๊กการเงินสีตู้
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
function add(group, prod, wv, hv) { w.addItem(); const chs = doc.querySelectorAll("#items .ch"); const d = chs[chs.length - 1]; sf(d, ".i-group", group); sf(d, ".i-prod", prod); if (wv) sf(d, ".i-w", wv); if (hv) sf(d, ".i-h", hv); return d; }
const has = (d, sel) => !!d.querySelector(sel);

// ===== G1 leak cuts =====
const dShower = add("1", "shower", "1.0", "2.0");
want("G1 shower: ไม่มี คาดตาราง", !has(dShower, ".o-gridmark"));
want("G1 shower: ไม่มี ฝังรางยู", !has(dShower, ".o-uchannel"));
want("G1 shower: ไม่มี ครอบวงกบ", !has(dShower, ".o-fcsides"));
const dInner = add("1", "inner_top_stack", "2.0", "2.0");
want("G1 เลื่อนภายใน: ไม่มี แผ่นทึบล่าง", !has(dInner, ".o-solidlower"));
want("G1 เลื่อนภายใน: ไม่มี ฝังรางยู", !has(dInner, ".o-uchannel"));
want("G1 เลื่อนภายใน: ไม่มี ดรอปพื้น", !has(dInner, ".o-dfm"));

// ===== G2 ราวกันตก leak (p.handrail) =====
const dRail = add("2", "imp1", "6.0", "1.0");
want("G2 ราวกันตก: ไม่มี คาดตาราง/ฝังรางยู/ครอบวงกบ/ดรอปพื้น", !has(dRail, ".o-gridmark") && !has(dRail, ".o-uchannel") && !has(dRail, ".o-fcsides") && !has(dRail, ".o-dfm"));
// imp1 dedup: ใบไม่มี "อุปกรณ์มาตรฐาน...สแตนเลสสีเงิน" ซ้ำกับ "หมุดสแตนเลสสีเงิน"
w.genQuote();
const railTxt = doc.querySelector("#quoteContent").textContent;
want("G2 imp1: ไม่มี 'อุปกรณ์มาตรฐานผู้ผลิต สแตนเลสสีเงิน' (ตัดซ้ำ)", !railTxt.includes("อุปกรณ์มาตรฐานผู้ผลิต สแตนเลสสีเงิน"));
want("G2 imp1: ยังมี 'หมุดสแตนเลสสีเงิน'", railTxt.includes("หมุดสแตนเลสสีเงิน"));

// ===== G5 มุ้ง leak cuts =====
const dMosq = add("5", "imp21", "1.0", "1.0");
const cwM = dMosq.querySelector(".i-color-wrap"), gwM = dMosq.querySelector(".i-glass-wrap");
want("G5 มุ้ง: ซ่อนสีอลู (i-color-wrap)", cwM && cwM.style.display === "none");
want("G5 มุ้ง: ซ่อนกระจก (i-glass-wrap)", gwM && gwM.style.display === "none");
want("G5 มุ้ง: ไม่มี คาดตาราง/ฝังรางยู/ดรอปพื้น", !has(dMosq, ".o-gridmark") && !has(dMosq, ".o-uchannel") && !has(dMosq, ".o-dfm"));

// ===== G6 กั้นห้องกระจก set: prod list ตัด shower/ระแนง/ราวบันได =====
const g6opts = w.prodOptionsG6 ? w.prodOptionsG6("6") : "";
want("G6: set ไม่มี shower", !/shower|ฉากกั้นอาบน้ำ/.test(g6opts), "");
want("G6: set ไม่มี ราวบันได (imp1-6)", !/value="imp[1-6]"/.test(g6opts));
want("G6: ยังมี บานเลื่อน/ดัดโค้ง/ฝ้า-ผนัง", /sliding_euro/.test(g6opts) && /curved_/.test(g6opts) && /isowall|wall_/.test(g6opts));

// ===== casement-euro-price: Linear ต่อบาน =====
const dCe = add("1", "casement_euro", "1.0", "2.2");
sf(dCe, ".i-type", "door");
w.refreshItype(dCe); // steady state (เหมือน user โต้ตอบ)
want("casement: เดี่ยว 1.0×2.2 = 20,000 (Linear)", w.readItem(dCe).r.sell === 20000, "sell=" + w.readItem(dCe).r.sell);
want("casement: label 'กว้าง/บาน'", /กว้าง\/บาน/.test(dCe.querySelector(".i-w").previousElementSibling.textContent), dCe.querySelector(".i-w").previousElementSibling.textContent);
// 2 บาน
if (dCe.querySelector(".i-panels")) sf(dCe, ".i-panels", "2");
sf(dCe, ".i-w", "0.8"); sf(dCe, ".i-h", "2.2");
want("casement: 0.8×2.2/บาน × 2 = 35,000", w.readItem(dCe).r.sell === 35000, "sell=" + w.readItem(dCe).r.sell);
// เกินขนาด → เตือน
sf(dCe, ".i-w", "1.8"); sf(dCe, ".i-h", "2.2");
want("casement: กว้าง 1.8 > 1.5 → เตือนเกินขนาด", (w.readItem(dCe).r.msgs || []).join(" ").includes("เกินขนาด"), "");

// ===== G4 บั๊กการเงิน: สีตู้อลู บวกเงินได้ =====
const dCab = add("4", "cabinet_alu", "1.2", "2.4");
const cwC = dCab.querySelector(".i-color-wrap");
want("G4: cabinet โชว์ color picker", cwC && cwC.style.display !== "none");
const sellWhite = w.readItem(dCab).r.sell;
const icC = dCab.querySelector(".i-color");
sf(dCab, ".i-color", icC.options[3].value); // ci>0 พรีเมียม
const cabPrem = w.readItem(dCab);
want("G4: cabinet เลือกสีพรีเมียม → ci>0 (ไม่ force 0)", cabPrem.ci > 0, "ci=" + cabPrem.ci);
want("G4: สีตู้อลู บวกเงินได้ (บั๊กการเงินแก้)", cabPrem.r.sell > sellWhite, "ขาว=" + sellWhite + " พรีเมียม=" + cabPrem.r.sell);

want("ไม่มี JS error", errors.length === 0, errors.slice(0, 2).join(" / "));

let pass = 0;
console.log("\n=== HANDOFF-UX-ALL-G1-G6 + casement-euro-price ===");
for (const c of checks) { console.log((c.ok ? "  ✓ " : "  ✗ ") + c.n + (c.d ? "  [" + c.d + "]" : "")); if (c.ok) pass++; }
console.log("\nสรุป: ผ่าน " + pass + "/" + checks.length);
process.exit(pass === checks.length ? 0 : 1);
