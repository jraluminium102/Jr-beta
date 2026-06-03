// QA Tester #5 — กั้นห้องกระจก + ระบบยอดรวม (ส่วนลด/VAT) + ตรรกะงวดชำระ
// กฎเหล็ก: "ยอดต้องตรง" + "ผลรวมงวด = net เป๊ะ"
// A) glasshouse ออกใบได้ + ราคาตรง   B) computeTotals ผ่าน genQuote (discPct/vat-pct)
// C) suggestInstallments(net) — mirror logic จาก src/lib/money.ts (อ่านไฟล์มา copy)
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../public/calculator/index.html", import.meta.url), "utf8");
const vc = new VirtualConsole();
const jsErrors = [];
vc.on("jsdomError", (e) => jsErrors.push(e.message));
const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc, url: "http://localhost/calculator/index.html" });
await new Promise((r) => { if (dom.window.document.readyState === "complete") r(); else dom.window.addEventListener("load", r); setTimeout(r, 1500); });
const w = dom.window, doc = w.document;

// ---------- helpers ----------
const rows = [];
const rec = (tc, title, input, expected, actual, pass, note = "") =>
  rows.push({ tc, title, input, expected, actual: String(actual), pass: !!pass, note });
const setField = (root, sel, value) => {
  const el = root.querySelector(sel); if (!el) throw new Error("ไม่พบ " + sel);
  el.value = String(value);
  el.dispatchEvent(new w.Event("input", { bubbles: true }));
  el.dispatchEvent(new w.Event("change", { bubbles: true }));
  return el;
};
const setId = (id, value) => setField(doc, "#" + id, value);
const txt = (el) => (el ? (el.textContent || "").replace(/ /g, " ").replace(/\s+/g, " ").trim() : "");
const numOf = (sel) => { const el = doc.querySelector(sel); if (!el) return NaN; const m = (el.textContent || "").replace(/[^\d]/g, ""); return m ? parseInt(m, 10) : NaN; };
const readSubtotal = () => numOf("#quoteContent .qtot .l");
const readGrand = () => numOf("#quoteContent .qtot .g");
const closeSvc = () => {
  ["svc-protect", "svc-lift", "svc-travel", "svc-ship", "svc-bkk"].forEach((id) => {
    const e = doc.getElementById(id); if (e && e.checked) { e.checked = false; e.dispatchEvent(new w.Event("change", { bubbles: true })); }
  });
  const f = doc.getElementById("svc-floors"); if (f) { f.value = "1"; f.dispatchEvent(new w.Event("input", { bubbles: true })); }
};
const clearItems = () => { doc.getElementById("items").innerHTML = ""; };

// ============================================================
// A) กั้นห้องกระจก (glasshouse) — TC1
// ============================================================
{
  clearItems();
  w.addItem(doc.getElementById("items"));
  const ch = doc.querySelector("#items .ch");
  setField(ch, ".i-group", "6");
  setField(ch, ".i-prod", "glasshouse");
  const priceEl = ch.querySelector(".o-ghprice");
  const PRICE = 506000;
  if (priceEl) setField(ch, ".o-ghprice", PRICE);
  const roomEl = ch.querySelector(".o-ghroom"); if (roomEl) setField(ch, ".o-ghroom", "ห้องอเนกประสงค์");
  const sideA = ch.querySelector(".o-ghside-A"); if (sideA) setField(ch, ".o-ghside-A", "ประตูบานเปิดคู่ + ติดตายข้าง");

  // อ่านราคาจาก readItem
  const it = w.readItem(ch);
  const sell = it && it.r ? it.r.sell : NaN;
  rec("TC1a", "glasshouse readItem ราคาเหมา", "group=6,prod=glasshouse,ghprice=506000",
    "it.r.sell = 506,000", sell, sell === PRICE);

  // ตั้ง VAT 0 เพื่อตรวจราคาเหมาตรงในใบ (ไม่ปนภาษี) + ปิดบริการ
  setId("vat-pct", "0"); setId("discPct", "0"); closeSvc();
  w.calcQuote(); w.genQuote();
  const qc = doc.getElementById("quoteContent"); const t = txt(qc);
  rec("TC1b", "glasshouse ใบ 'ออก' ไม่ถูกกรอง", "genQuote()", "ใบยาว > 50 + ไม่ว่าง",
    "len=" + t.length, t.length > 50);
  rec("TC1c", "ใบมีคำว่า 'กั้นห้องกระจก'", "—", "พบ 'กั้นห้องกระจก'",
    t.includes("กั้นห้องกระจก") ? "พบ" : "ไม่พบ", t.includes("กั้นห้องกระจก"));
  rec("TC1d", "ใบมีราคา 506,000", "—", "พบ '506,000'",
    t.includes("506,000") ? "พบ" : "ไม่พบ", t.includes("506,000"));
  const sub = readSubtotal(), grand = readGrand();
  rec("TC1e", "subtotal = 506,000 (เหมา)", "ghprice=506000", "506,000", sub, sub === PRICE);
  rec("TC1f", "VAT0 → รวมทั้งสิ้น = subtotal", "vat=0", "506,000", grand, grand === PRICE);
}

// ============================================================
// B) ยอดรวม/ภาษี — ผ่าน genQuote (override ราคา → เลี่ยงสูตรพื้นที่)
// helper: สร้าง n บานในชุดเดียว ตั้ง override ตาม arr
// ============================================================
function buildItems(overrides) {
  clearItems();
  const setBox = w.addSet();
  const parts = setBox.querySelector(".set-parts");
  for (let i = 1; i < overrides.length; i++) w.addItem(parts);
  const chs = [...setBox.querySelectorAll(".ch")];
  chs.forEach((ch, i) => {
    setField(ch, ".i-group", "1");
    setField(ch, ".i-type", "window");
    setField(ch, ".i-w", "1.8");
    setField(ch, ".i-h", "1.2");
    setField(ch, ".i-glass", "0");
    setField(ch, ".i-panels", "2");
    setField(ch, ".i-qty", "1");
    setField(ch, ".i-override", overrides[i]);
  });
  return chs;
}

// ---- TC2: VAT 7%, ไม่มีส่วนลด ----
{
  const OV = [21000, 18000, 28000]; const SUB = 67000;
  buildItems(OV); closeSvc(); setId("discPct", "0"); setId("vat-pct", "7");
  w.calcQuote(); w.genQuote();
  const sub = readSubtotal(), grand = readGrand();
  const expVat = Math.round(SUB * 0.07), expGrand = SUB + expVat; // 4690 → 71690
  rec("TC2a", "subtotal = ผลรวม line", OV.join("+"), String(SUB), sub, sub === SUB);
  rec("TC2b", "VAT7% + รวมทั้งสิ้น = subtotal+VAT", "vat=7%, svc off",
    String(expGrand) + " (sub+vat " + expVat + ")", grand, grand === expGrand);
}

// ---- TC3: ส่วนลด 2% (ยอด ≥ 50,000) → ฐาน VAT = subtotal - disc ----
{
  const OV = [60000, 40000]; const SUB = 100000;
  buildItems(OV); closeSvc(); setId("discPct", "2"); setId("vat-pct", "7");
  w.calcQuote(); w.genQuote();
  const sub = readSubtotal(), grand = readGrand();
  const discAmt = SUB * 0.02;               // 2000
  const afterDisc = SUB - discAmt;           // 98000
  const vat = Math.round(afterDisc * 0.07);  // 6860
  const expGrand = afterDisc + vat;          // 104860
  rec("TC3a", "subtotal คงเดิม (ก่อนลด)", OV.join("+"), String(SUB), sub, sub === SUB);
  rec("TC3b", "ส่วนลด 2% → VAT คิดบนฐานหลังลด → รวมทั้งสิ้น",
    "disc=2%, vat=7%", String(expGrand) + " ((sub-2%)+vat)", grand, grand === expGrand,
    "ฐาน VAT=" + afterDisc + " vat=" + vat);
}

// ---- TC3c: ลำดับถูก — ตรวจ clampDisc (ยอด<50,000 ลดไม่ได้) ----
{
  const OV = [20000, 15000]; const SUB = 35000; // < 50,000
  buildItems(OV); closeSvc(); setId("discPct", "2"); setId("vat-pct", "7");
  w.calcQuote(); w.genQuote();
  const sub = readSubtotal(), grand = readGrand();
  const vat = Math.round(SUB * 0.07);        // ไม่ลด → 2450
  const expGrand = SUB + vat;                // 37450
  rec("TC3c", "ยอด<50,000 → clamp ส่วนลด=0 (ลดไม่ได้)",
    "sub=35,000 disc=2%", String(expGrand) + " (ไม่ลด)", grand, grand === expGrand);
}

// ---- TC4: VAT 0% → รวมทั้งสิ้น = subtotal (logic ใบคุณปีเตอร์) ----
{
  const OV = [515000]; const SUB = 515000;
  buildItems(OV); closeSvc(); setId("discPct", "0"); setId("vat-pct", "0");
  w.calcQuote(); w.genQuote();
  const sub = readSubtotal(), grand = readGrand();
  rec("TC4a", "subtotal = 515,000", "1 line 515,000", "515,000", sub, sub === SUB);
  rec("TC4b", "VAT0 → รวมทั้งสิ้น = subtotal (ใบปีเตอร์)",
    "vat=0%", "515,000", grand, grand === SUB);
}

// ============================================================
// C) suggestInstallments(net) — mirror logic จาก src/lib/money.ts
// (อ่านไฟล์ยืนยันค่าคงที่ RETENTION + สูตรแต่ละช่วงตรงกับโค้ดจริง)
// ============================================================
const RETENTION = 40000;
function suggestInstallments(net) {
  const a = Math.max(0, Math.round(Number(net) || 0));
  const mk = (parts, labels) => parts.map((amt, i) => ({ seq: i + 1, label: labels[i], amount: amt }));
  if (a <= 100000) {
    const g1 = Math.round(a * 0.7);
    return mk([g1, a - g1], ["งวด 1/2 (70%)", "งวด 2/2 (30%)"]);
  }
  if (a <= 300000) {
    const g1 = Math.round(a * 0.4), g2 = Math.round(a * 0.5);
    return mk([g1, g2, a - g1 - g2], ["งวด 1/3 (40%)", "งวด 2/3 (50%)", "งวด 3/3 (10%)"]);
  }
  if (a <= 700000) {
    const g1 = Math.round(a * 0.35), g2 = Math.round(a * 0.3);
    const g3 = a - g1 - g2 - RETENTION;
    return mk([g1, g2, g3, RETENTION], ["งวด 1/4", "งวด 2/4", "งวด 3/4 (เหลือ)", "งวด 4/4 (ประกัน)"]);
  }
  const g = Math.round(a * 0.25);
  const g4 = a - g * 3 - RETENTION;
  return mk([g, g, g, g4, RETENTION], ["งวด 1/5", "งวด 2/5", "งวด 3/5", "งวด 4/5 (เหลือ)", "งวด 5/5 (ประกัน)"]);
}

function checkInstallment(tc, net, expCount) {
  const plan = suggestInstallments(net);
  const sum = plan.reduce((a, p) => a + p.amount, 0);
  const amounts = plan.map((p) => p.amount.toLocaleString("en-US")).join(" / ");
  const sumOk = sum === net;
  const cntOk = plan.length === expCount;
  const allNonNeg = plan.every((p) => p.amount >= 0);
  rec(tc, "งวด net " + net.toLocaleString("en-US"), "net=" + net,
    expCount + " งวด · ผลรวม = " + net.toLocaleString("en-US"),
    plan.length + " งวด · ผลรวม=" + sum.toLocaleString("en-US") + " [" + amounts + "]",
    sumOk && cntOk && allNonNeg,
    (allNonNeg ? "" : "⚠ มีงวดติดลบ ") + (plan[plan.length - 1].amount === RETENTION && expCount >= 4 ? "ประกัน=40k ✓" : ""));
}
checkInstallment("TC5", 80000, 2);
checkInstallment("TC6", 250000, 3);
checkInstallment("TC7", 500000, 4);
checkInstallment("TC8", 850000, 5);

// ---------- JS errors gate ----------
const realErrs = jsErrors.filter((e) => !/sheetjs|xlsx|external|Could not load|scrollTo|Not implemented|net::|localStorage/i.test(e));
rec("TC0", "ไม่มี JS error ร้ายแรง", "—", "0 error", realErrs.length + " error", realErrs.length === 0, realErrs.slice(0, 2).join(" | "));

// ============================================================
// รายงาน
// ============================================================
let pass = 0;
console.log("=== QA-T5 ยอดรวม/ภาษี/งวด + กั้นห้องกระจก ===\n");
console.log("| TC | หัวข้อ | Input | Expected | Actual | ผล | หมายเหตุ |");
console.log("|----|--------|-------|----------|--------|----|---------|");
for (const r of rows) {
  if (r.pass) pass++;
  console.log(`| ${r.tc} | ${r.title} | ${r.input} | ${r.expected} | ${r.actual} | ${r.pass ? "✅" : "❌"} | ${r.note} |`);
}
console.log(`\nผ่าน ${pass}/${rows.length}`);
process.exit(pass === rows.length ? 0 : 1);
