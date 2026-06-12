// HANDOFF G2 รอบ 3 verify — R3-1 (เพิ่มบาน +5,000/บาน) · R3-2 (override ราคาประตู) · R3-4 (ราวกันตก ชื่อ+ออปชั่น)
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../public/calculator/index.html", import.meta.url), "utf8");
const vc = new VirtualConsole();
const errors = [];
vc.on("jsdomError", (e) => { if (!/Not implemented:|scrollTo/.test(e.message)) errors.push(e.message); });
const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc, url: "http://localhost/calculator/index.html" });
await new Promise((r) => { if (dom.window.document.readyState === "complete") r(); else dom.window.addEventListener("load", r); setTimeout(r, 1500); });
const w = dom.window, doc = w.document;

const checks = [];
const want = (n, ok, d) => checks.push({ n, ok: !!ok, d: d || "" });
function sf(ch, sel, v) { const e = ch.querySelector(sel); if (!e) throw new Error("no " + sel); e.value = String(v); e.dispatchEvent(new w.Event("input", { bubbles: true })); e.dispatchEvent(new w.Event("change", { bubbles: true })); return e; }
function addRow(group, prod, wv, hv, panels) {
  w.addItem();
  const chs = doc.querySelectorAll("#items .ch");
  const d = chs[chs.length - 1];
  sf(d, ".i-group", group);
  sf(d, ".i-prod", prod);
  if (d.querySelector(".i-panels")) sf(d, ".i-panels", panels || 1);
  sf(d, ".i-w", wv); sf(d, ".i-h", hv);
  if (d.querySelector(".i-qty")) sf(d, ".i-qty", "1");
  return d;
}

// ===== R3-1: casement_euro — เปลี่ยนเป็น Linear ต่อบาน (casement-euro-price แทน R3-1 เดิม) =====
// 1.6×2.2/บาน → 15,000+max(0,3.52-1.2)×4,166.67 = 24,666.67/บาน
const d1 = addRow("1", "casement_euro", "1.6", "2.2", 2);
const sell2 = w.readItem(d1).r.sell;
sf(d1, ".i-panels", "3");
const sell3 = w.readItem(d1).r.sell;
want("R3-1→Linear: 2 บาน (1.6×2.2/บาน) = 50,000", sell2 === 50000, "sell2=" + sell2);
want("R3-1→Linear: 3 บาน เพิ่ม 1 ราคา/บาน (~24,000-25,000)", (sell3 - sell2) >= 23000 && (sell3 - sell2) <= 26000, "Δ=" + (sell3 - sell2));

// ===== R3-2a: ranae ทำเป็นประตู — override ราคา =====
const d2 = addRow("2", "rn2", "2.0", "2.5", 1);
sf(d2, ".o-doortype", "casement_euro");
const rnAuto = w.readItem(d2).r.sell;
sf(d2, ".o-doorprice", "15000");
const rd = w.readItem(d2);
want("R3-2a: readItem อ่าน doorprice", rd.optSel.doorprice === "15000", "v=" + rd.optSel.doorprice);
want("R3-2a: override เปลี่ยนราคา (≠ auto)", rd.r.sell !== rnAuto, "auto=" + rnAuto + " ovr=" + rd.r.sell);
want("R3-2a: ใบระบุ (ราคากำหนดเอง)", (rd.r.msgs || []).join(" ").includes("ราคากำหนดเอง"), (rd.r.msgs||[]).join(" ").slice(0,90));
sf(d2, ".o-doorprice", "0");
want("R3-2a: ว่าง/0 = กลับ auto", w.readItem(d2).r.sell === rnAuto, "sell=" + w.readItem(d2).r.sell);

// ===== R3-2b: bar_slide — override ราคาประตู =====
const d3 = addRow("2", "bar_slide", "2.0", "2.0", 1);
sf(d3, ".o-bsdoor", "sliding_sms");
const bsAuto = w.readItem(d3).r.sell;
sf(d3, ".o-bsdoorprice", "20000");
const bd = w.readItem(d3);
want("R3-2b: readItem อ่าน bsDoorPrice", bd.optSel.bsDoorPrice === "20000", "v=" + bd.optSel.bsDoorPrice);
want("R3-2b: override เปลี่ยนราคา (≠ auto)", bd.r.sell !== bsAuto, "auto=" + bsAuto + " ovr=" + bd.r.sell);
want("R3-2b: ใบระบุ (ราคากำหนดเอง)", (bd.r.msgs || []).join(" ").includes("ราคากำหนดเอง"), "");

// ===== R3-4: ราวกันตก ชื่อใหม่ + ออปชั่น =====
const dImp1 = addRow("2", "imp1", "6.0", "1.0", 1);
const it1 = w.readItem(dImp1);
want("R3-4: imp1 ชื่อใหม่ 'ราวกันตกกระจกเฉียง หมุดแปะข้าง'", it1.p.name === "ราวกันตกกระจกเฉียง หมุดแปะข้าง", it1.p.name);
want("R3-4: imp1 ไม่มี (ก)/(ข)/บันได/เลข", !/บันได|\(ก\)|\(ข\)|47\./.test(it1.p.name));
want("R3-4: imp1 (railstud) ไม่มีช่องสีอลู", dImp1.querySelector(".o-railalucolor") === null);
// handrail relabel
sf(dImp1, ".o-handrail", "u5");

const dImp2 = addRow("2", "imp2", "5.0", "1.0", 1);
want("R3-4: imp2 (railalu) มีช่องสีอลู 3 สี", dImp2.querySelectorAll(".o-railalucolor option").length === 3, "n=" + dImp2.querySelectorAll(".o-railalucolor option").length);
want("R3-4: imp2 ไม่มี railstud flag", !w.readItem(dImp2).p.railstud);
sf(dImp2, ".o-railalucolor", "ดำ");

w.genQuote();
const qc = doc.querySelector("#quoteContent").textContent;
want("R3-4: ใบ imp1 มี 'หมุดสแตนเลสสีเงิน'", qc.includes("หมุดสแตนเลสสีเงิน"));
want("R3-4: ใบ imp1 มี 'ราวมือจับด้านบน ยู อลูมิเนียม'", qc.includes("ราวมือจับด้านบน ยู อลูมิเนียม"));
want("R3-4: ใบ imp2 มี 'อลูมิเนียม สีดำ'", qc.includes("อลูมิเนียม สีดำ"));

want("ไม่มี JS error", errors.length === 0, errors.slice(0, 2).join(" / "));

let pass = 0;
console.log("\n=== HANDOFF G2 รอบ 3 (R3-1/R3-2/R3-4) ===");
for (const c of checks) { console.log((c.ok ? "  ✓ " : "  ✗ ") + c.n + (c.d ? "  [" + c.d + "]" : "")); if (c.ok) pass++; }
console.log("\nสรุป: ผ่าน " + pass + "/" + checks.length);
process.exit(pass === checks.length ? 0 : 1);
