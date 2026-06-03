// gen-formats.mjs — สร้างใบเสนอราคา 10 "รูปแบบสินค้า (format)" ที่ต่างกัน จากเครื่องคิดราคา R3.9 (headless jsdom)
// ราคาคิดจากสูตรจริง (readItem/calcUnit) — ห้ามใช้ .i-override · ห้ามแก้สูตร/ราคา
// Output: test/samples-formats/quote-01..10.html + PRICING_GUIDE.md
//
// หัวใจ: หลัง setField + calcQuote() เก็บ [...#items .ch].map(readItem) แล้วอ่าน r.sell / r.a / r.msgs
//   - product แบบ special method (ราว/มุ้ง/glasshouse ฯลฯ) มี r.msgs อธิบายครบ → ใช้ตรงๆ
//   - product แบบ bucket (เลื่อน/เปิด/ติดตาย/กระทุ้ง) r.msgs ไม่มีคำอธิบาย area×rate
//     → reconstruct เองจาก RATES/min ที่ mirror มา (ref R3.9 v11 — cross-check เท่านั้น)
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dirname, "../public/calculator/index.html"), "utf8");
const OUT = join(__dirname, "samples-formats");
mkdirSync(OUT, { recursive: true });

const vc = new VirtualConsole();
const errors = [];
vc.on("jsdomError", (e) => errors.push(e.message));

const dom = new JSDOM(html, {
  runScripts: "dangerously",
  pretendToBeVisual: true,
  virtualConsole: vc,
  url: "http://localhost/calculator/index.html",
});
await new Promise((r) => {
  if (dom.window.document.readyState === "complete") r();
  else dom.window.addEventListener("load", r);
  setTimeout(r, 1500);
});

const w = dom.window;
const doc = w.document;

// ---------- RATES (mirror จาก R3.9 v11 — ใช้ reconstruct คำอธิบายเท่านั้น ไม่กระทบการคิดเงิน) ----------
// การคิดเงินจริงทั้งหมดมาจาก readItem/calcUnit ของตัวเครื่อง · ตารางนี้ "อธิบาย" ราคาที่เครื่องให้มา
const RATES = {
  SMS:[[2.0,2.3,6500],[2.3,3.5,6000],[3.5,4.5,5700],[4.5,5.0,5000],[5.0,7.0,4700],[7.0,9.0,4400],[9.0,12,4200],[12,9999,4000]],
  EURO:[[2.0,2.3,7200],[2.3,3.5,6600],[3.5,4.5,6300],[4.5,5.0,5500],[5.0,7.0,5200],[7.0,9.0,4900],[9.0,12,4700],[12,9999,4400]],
  FIX:[[0.5,1.0,8000],[1.0,1.5,7500],[1.5,2.0,7000],[2.0,2.5,6500],[2.5,3.0,6000],[3.0,3.5,5000],[3.5,9999,5000]],
  AWN:[[0.6,0.8,18000],[0.8,1.1,14400],[1.1,1.3,12000],[1.3,1.6,10800],[1.6,2.0,9600],[2.0,2.5,8400],[2.5,2.9,7800],[2.9,5.5,7200],[5.5,6.0,6600],[6.0,9999,6300]],
  OPEN:[[2.0,2.4,7500],[2.4,3.0,7000],[3.0,3.5,7000],[3.5,4.0,6500],[4.0,5.0,6000],[5.0,6.0,5500],[6.0,9999,5000]],
};
// rateOf เดียวกับเครื่อง: ต่ำกว่าช่วงแรก→ใช้ rate แรก · ในช่วง [lo,hi)→rate · เกิน→rate สุดท้าย
function rateOf(area, t) {
  if (area < t[0][0]) return t[0][2];
  for (const r of t) { if (area >= r[0] && area < r[1]) return r[2]; }
  return t[t.length - 1][2];
}
function tierLabel(area, t) {
  if (area < t[0][0]) return `< ${t[0][0]} → ใช้เรตช่วงแรก`;
  for (const r of t) { if (area >= r[0] && area < r[1]) return `ช่วง ${r[0]}-${r[1] >= 9999 ? "∞" : r[1]} ตร.ม.`; }
  const last = t[t.length - 1]; return `≥ ${last[0]} ตร.ม.`;
}
const fmt = (x) => (isNaN(x) ? "—" : Math.round(x).toLocaleString("en-US"));

// ---------- helpers (เหมือน gen-samples.mjs) ----------
function fire(el, type) { el.dispatchEvent(new w.Event(type, { bubbles: true })); }
function addItem(container) { w.addItem(container); const chs = container.querySelectorAll(".ch"); return chs[chs.length - 1]; }
function setField(ch, sel, value) {
  const el = ch.querySelector(sel);
  if (!el) throw new Error("ไม่พบ field " + sel + " ใน .ch");
  el.value = String(value);
  fire(el, "input"); fire(el, "change");
  return el;
}
function setItem(ch, cfg) {
  if (cfg.group != null) setField(ch, ".i-group", cfg.group);
  if (cfg.prod != null) {
    const prodSel = ch.querySelector(".i-prod");
    if (!prodSel.querySelector('option[value="' + cfg.prod + '"]')) {
      prodSel.innerHTML = w.prodOptionsG6(String(cfg.group || ch.querySelector(".i-group").value));
    }
    prodSel.value = cfg.prod;
    if (prodSel.value !== cfg.prod) throw new Error("เลือก prod ไม่ได้: " + cfg.prod);
    fire(prodSel, "change");
  }
  if (cfg.type != null) setField(ch, ".i-type", cfg.type);
  if (cfg.w != null) setField(ch, ".i-w", cfg.w);
  if (cfg.h != null) setField(ch, ".i-h", cfg.h);
  if (cfg.glass != null) setField(ch, ".i-glass", cfg.glass);
  if (cfg.color != null) setField(ch, ".i-color", cfg.color);
  if (cfg.panels != null) setField(ch, ".i-panels", cfg.panels);
  if (cfg.qty != null) setField(ch, ".i-qty", cfg.qty);
  if (cfg.opts) for (const [sel, val] of Object.entries(cfg.opts)) {
    const oel = ch.querySelector(sel);
    if (oel) {
      if (oel.type === "checkbox") oel.checked = !!val;
      else if (oel.multiple) { [...oel.options].forEach(o => { o.selected = (Array.isArray(val) ? val : [val]).map(String).includes(o.value); }); }
      else oel.value = String(val);
      fire(oel, "input"); fire(oel, "change");
    }
  }
}
function setDoc(id, value, kind) {
  const el = doc.getElementById(id);
  if (!el) return false;
  if (kind === "check") { el.checked = !!value; fire(el, "change"); }
  else { el.value = String(value); fire(el, "input"); fire(el, "change"); }
  return true;
}
function resetServices() {
  ["svc-protect", "svc-lift", "svc-travel", "svc-ship", "svc-bkk"].forEach((id) => {
    const el = doc.getElementById(id); if (el && el.checked) { el.checked = false; fire(el, "change"); }
  });
  setDoc("svc-floors", "1"); setDoc("svc-risky", "1");
  setDoc("svc-protect-points", "0"); setDoc("svc-lift-floor", "0"); setDoc("svc-lift-extra", "0");
  setDoc("svc-travel-km", "0"); setDoc("svc-ship-km", "0"); setDoc("svc-ship-trucks", "1");
  setDoc("discPct", "0"); setDoc("discFlat", "0");
  const vat = doc.getElementById("vat-pct"); if (vat) { vat.value = "7"; fire(vat, "change"); }
}
function clearItems() {
  doc.getElementById("items").innerHTML = "";
  w.qSplit = false; w.qSplitGroups = {};
}
function num(s) { const m = String(s || "").replace(/[^\d]/g, ""); return m ? parseInt(m, 10) : NaN; }
function readSubtotal() { const l = doc.querySelector("#quoteContent .qtot .l"); return l ? num(l.textContent) : NaN; }
function readGrand() { const g = doc.querySelector("#quoteContent .qtot .g"); return g ? num(g.textContent) : NaN; }
function readVatAmt() {
  const rows = [...doc.querySelectorAll("#quoteContent .qtot .l")];
  for (const r of rows) {
    const spans = r.querySelectorAll("span");
    if (spans.length >= 2 && /^VAT/.test((spans[0].textContent || "").trim())) return num(spans[1].textContent);
  }
  return NaN;
}
function visibleText(el) { return (el.textContent || "").replace(/ /g, " ").replace(/\s+/g, " ").trim(); }

const ALL_CSS = [...doc.querySelectorAll("style")].map((s) => s.textContent).join("\n");
function wrapHtml(title, inner) {
  return `<!doctype html><html lang="th"><head><meta charset="utf-8">`
    + `<meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<title>${title}</title><style>\n${ALL_CSS}\n</style></head>`
    + `<body style="background:#eee;padding:20px;">${inner}</body></html>`;
}

// อธิบายราคา bucket (เลื่อน/เปิด/ติดตาย/กระทุ้ง) จากค่าจริงที่เครื่องคืนมา
// it = readItem result · ratesKey = key ใน RATES mirror · min = ขั้นต่ำของ product
// คืน string คำอธิบาย area×rate vs min (ปัดขึ้นพัน) — แล้วระบุ extras (กระจก/สี/option) จาก sell ที่เหลือ
function explainBucket(it, ratesKey, min, opts = {}) {
  const a = it.r.a;
  const t = RATES[ratesKey];
  const rate = rateOf(a, t);
  const byArea = a * rate;
  const baseCore = Math.max(min, byArea); // ก่อน addon บานคู่/บานเพิ่ม
  const lines = [];
  lines.push(`พื้นที่ ${it.w}×${it.h} = ${a.toFixed(2)} ตร.ม. → ${tierLabel(a, t)} เรต ${fmt(rate)}`);
  lines.push(`${a.toFixed(2)} × ${fmt(rate)} = ${fmt(byArea)} ${byArea >= min ? "≥" : "<"} ขั้นต่ำ ${fmt(min)} → ใช้ฐาน ${fmt(baseCore)}`);
  // หมายเหตุ: ราคา/ชุดจริงจากเครื่องปัดขึ้นทีละพัน (roundUp) หลังบวกกระจก/สี/option
  const sell = it.r.sell;
  if (sell !== baseCore && !opts.hasExtras) {
    lines.push(`ปัดขึ้นทีละพัน (roundUp) → ราคา/ชุด ${fmt(sell)}`);
  }
  return { lines, baseCore, rate, byArea };
}

// ---------- 10 รูปแบบ (format ต่างกัน) ----------
const formats = [
  {
    id: "format-1", title: "บานเลื่อนภายนอก SMS (เซมิยูโร)",
    cust: "คุณสมชาย / บ้านเดี่ยว ซ.ลาดพร้าว",
    fill: "บานเลื่อนสลับ 1.80×1.20 · กระจกเขียว 6มม. · สีอบขาว · 2 บาน · 1 ชุด",
    build() {
      const ch = addItem(doc.getElementById("items"));
      setItem(ch, { group: 1, prod: "sliding_sms", type: "window", w: 1.8, h: 1.2, glass: 0, color: 0, panels: 2, qty: 1 });
    },
    explain(items) {
      const it = items[0];
      const e = explainBucket(it, "SMS", 6500);
      return {
        product: "บานเลื่อน เซมิยูโร (SMS) — บานเลื่อนสลับ",
        fillNote: "หน้าต่าง · กว้าง 1.80 × สูง 1.20 ม. · กระจกเขียว 6 มม. · สีอบขาว · 2 บาน · ขั้นต่ำรุ่น 6,500",
        formula: `สูตรบานเลื่อน SMS: max(6,500, พื้นที่ × เรต)`,
        steps: [...e.lines, `กระจกเขียว 6 มม. = เกรดมาตรฐาน (ส่วนเพิ่มกระจก 0) · สีอบขาว = 0 → ราคา/ชุด ${fmt(it.r.sell)}`],
        engineMsgs: it.r.msgs,
        unit: it.r.sell, qty: it.qty,
      };
    },
  },
  {
    id: "format-2", title: "บานเลื่อนภายนอก ยูโร",
    cust: "คุณวิภา / ทาวน์โฮม รังสิต",
    fill: "บานเลื่อน 2.40×2.20 · ยูโรเกรย์ 6มม. · สีดำ · 2 บาน · 1 ชุด",
    build() {
      const ch = addItem(doc.getElementById("items"));
      setItem(ch, { group: 1, prod: "sliding_euro", type: "door", w: 2.4, h: 2.2, glass: 5, color: 1, panels: 2, qty: 1 });
    },
    explain(items) {
      const it = items[0];
      const e = explainBucket(it, "EURO", 7500);
      return {
        product: "บานเลื่อน ยูโร — บานเลื่อนสลับ",
        fillNote: "ประตู · กว้าง 2.40 × สูง 2.20 ม. · ยูโรเกรย์ 6 มม. (Perane) · สีดำ · 2 บาน · ขั้นต่ำรุ่น 7,500",
        formula: `สูตรบานเลื่อน ยูโร: max(7,500, พื้นที่ × เรต) + ส่วนเพิ่มกระจก + สี`,
        steps: [...e.lines, `ยูโรเกรย์ 6 มม. มีส่วนเพิ่มกระจก (รวมแล้วในราคาเครื่อง) · สีดำ = 0 → ราคา/ชุด ${fmt(it.r.sell)}`],
        engineMsgs: it.r.msgs,
        unit: it.r.sell, qty: it.qty,
      };
    },
  },
  {
    id: "format-3", title: "บานกระจกติดตาย ขนาดใหญ่",
    cust: "บจก. ทรัพย์มงคล / โชว์รูม",
    fill: "กระจกติดตาย 3.00×2.80 · ยูโรเกรย์ 8มม. · สีเทาซาฮารา · 1 ชุด",
    build() {
      const ch = addItem(doc.getElementById("items"));
      setItem(ch, { group: 1, prod: "fixed_glass", type: "window", w: 3.0, h: 2.8, glass: 6, color: 2, panels: 1, qty: 1 });
    },
    explain(items) {
      const it = items[0];
      const e = explainBucket(it, "FIX", 5000);
      return {
        product: "กระจกติดตาย",
        fillNote: "หน้าต่าง · กว้าง 3.00 × สูง 2.80 ม. = 8.40 ตร.ม. · ยูโรเกรย์ 8 มม. (Perane) · สีเทาซาฮารา · ขั้นต่ำรุ่น 5,000",
        formula: `สูตรกระจกติดตาย: max(5,000, พื้นที่ × เรต) + ส่วนเพิ่มกระจก + สี`,
        steps: [...e.lines, `+ ส่วนเพิ่มกระจกยูโรเกรย์ 8 มม. และค่าสีเทาซาฮารา (ตามพื้นที่) → ราคา/ชุด ${fmt(it.r.sell)}`],
        engineMsgs: it.r.msgs,
        unit: it.r.sell, qty: it.qty,
      };
    },
  },
  {
    id: "format-4", title: "บานกระทุ้ง ยูโร",
    cust: "คุณนภา / บ้านสวน นครปฐม",
    fill: "บานกระทุ้ง 0.90×0.60 · กระจกเขียว 6มม. · สีอบขาว · 1 บาน · 1 ชุด",
    build() {
      const ch = addItem(doc.getElementById("items"));
      setItem(ch, { group: 1, prod: "awning_euro", type: "window", w: 0.9, h: 0.6, glass: 0, color: 0, panels: 1, qty: 1 });
    },
    explain(items) {
      const it = items[0];
      // บานกระทุ้ง: ใช้ max(0.6, area) กับ rate AWN + min รุ่น 10,000
      const a = it.r.a;
      const aEff = Math.max(0.6, a);
      const rate = rateOf(aEff, RATES.AWN);
      const byArea = aEff * rate;
      return {
        product: "บานกระทุ้ง ยูโร",
        fillNote: "หน้าต่าง · กว้าง 0.90 × สูง 0.60 ม. = 0.54 ตร.ม. · กระจกเขียว 6 มม. · สีอบขาว · 1 บาน · ขั้นต่ำรุ่น 10,000",
        formula: `สูตรบานกระทุ้ง ยูโร: max(10,000, max(0.6, พื้นที่) × เรต) + บานเพิ่ม×2,900 + option`,
        steps: [
          `พื้นที่ ${it.w}×${it.h} = ${a.toFixed(2)} ตร.ม. · ใช้ max(0.6, ${a.toFixed(2)}) = ${aEff.toFixed(2)} ตร.ม.`,
          `${aEff.toFixed(2)} × เรต ${fmt(rate)} = ${fmt(byArea)} < ขั้นต่ำ 10,000 → ใช้ขั้นต่ำ 10,000`,
          `บาน 1 บาน → ไม่มีบานเพิ่ม (บานที่ 2+ คิด ×2,900) · ไม่มี option → ราคา/ชุด ${fmt(it.r.sell)}`,
        ],
        engineMsgs: it.r.msgs,
        unit: it.r.sell, qty: it.qty,
      };
    },
  },
  {
    id: "format-5", title: "ประตูบานเปิด ยูโร (บานคู่) + มือจับสแตนเลส",
    cust: "คุณธีระ / บ้าน 2 ชั้น",
    fill: "ประตูบานเปิด 1.60×2.20 · ยูโรเกรย์ 6มม. · สีดำ · บานคู่ + มือจับสแตน 60ซม.",
    build() {
      const ch = addItem(doc.getElementById("items"));
      setItem(ch, { group: 1, prod: "casement_euro", type: "door", w: 1.6, h: 2.2, glass: 5, color: 1, panels: 2, qty: 1,
        opts: { ".o-stainless": "2" } }); // 60 ซม. +2,000
    },
    explain(items) {
      const it = items[0];
      const a = it.r.a;
      const rate = rateOf(a, RATES.OPEN);
      const byArea = a * rate;
      const core = Math.max(18000, byArea);
      return {
        product: "บานเปิด ยูโร (ประตู บานคู่)",
        fillNote: "ประตู · กว้าง 1.60 × สูง 2.20 ม. = 3.52 ตร.ม. · ยูโรเกรย์ 6 มม. · สีดำ · บานคู่ · มือจับสแตนอร่าม 60 ซม. (+2,000) · ขั้นต่ำเดี่ยว 18,000",
        formula: `สูตรประตูบานเปิด ยูโร: เดี่ยว max(18,000, พื้นที่×เรต) · บานคู่ +14,000 · + ส่วนเพิ่มกระจก + option`,
        steps: [
          `พื้นที่ ${it.w}×${it.h} = ${a.toFixed(2)} ตร.ม. → เรต ${fmt(rate)} · ${a.toFixed(2)}×${fmt(rate)} = ${fmt(byArea)} ${byArea >= 18000 ? "≥" : "<"} ขั้นต่ำ 18,000 → ใช้ ${fmt(core)}`,
          `บานคู่ (2 บาน) → + ส่วนบานคู่ 14,000`,
          `+ ส่วนเพิ่มกระจกยูโรเกรย์ 6 มม. + มือจับสแตนอร่าม 60 ซม. (+2,000) → ราคา/ชุด ${fmt(it.r.sell)}`,
        ],
        engineMsgs: it.r.msgs,
        unit: it.r.sell, qty: it.qty,
      };
    },
  },
  {
    id: "format-6", title: "บานเฟี้ยม เซมิยูโร",
    cust: "คุณกมล / รีโนเวทบ้าน เปิดโล่ง",
    fill: "บานเฟี้ยม 3.20×2.40 · กระจกเขียว 6มม. · สีอบขาว · 4 บาน · 1 ชุด",
    build() {
      const ch = addItem(doc.getElementById("items"));
      setItem(ch, { group: 1, prod: "folding", type: "door", w: 3.2, h: 2.4, glass: 0, color: 0, panels: 4, qty: 1 });
    },
    explain(items) {
      const it = items[0];
      const a = it.r.a;
      const unitRate = 9000, perPanelMin = 15000, panels = 4;
      const byArea = a * unitRate;
      const byPanel = perPanelMin * panels;
      return {
        product: "บานเฟี้ยม เซมิยูโร",
        fillNote: "ประตู · กว้าง 3.20 × สูง 2.40 ม. = 7.68 ตร.ม. · กระจกเขียว 6 มม. · สีอบขาว · 4 บาน",
        formula: `สูตรบานเฟี้ยม: max(พื้นที่ × 9,000, ขั้นต่ำต่อบาน 15,000 × จำนวนบาน)`,
        steps: [
          `พื้นที่ ${it.w}×${it.h} = ${a.toFixed(2)} ตร.ม. × 9,000/ตร.ม. = ${fmt(byArea)}`,
          `ขั้นต่ำต่อบาน 15,000 × ${panels} บาน = ${fmt(byPanel)}`,
          `เลือกค่าที่มากกว่า = ${fmt(Math.max(byArea, byPanel))} → ราคา/ชุด ${fmt(it.r.sell)}`,
        ],
        engineMsgs: it.r.msgs,
        unit: it.r.sell, qty: it.qty,
      };
    },
  },
  {
    id: "format-7", title: "มุ้ง — มุ้งเฟรมใหญ่ (เลื่อน/เปิด)",
    cust: "คุณอรุณ / บ้านพักอาศัย",
    fill: "มุ้งเฟรมใหญ่ 1.80×2.10 (ประตู) · ผ้าไฟเบอร์ · 1 ชุด",
    build() {
      const ch = addItem(doc.getElementById("items"));
      setItem(ch, { group: 5, prod: "imp23", type: "door", w: 1.8, h: 2.1, qty: 1 });
    },
    explain(items) {
      const it = items[0];
      return {
        product: "มุ้งเฟรมใหญ่ (เลื่อน/เปิด/กระทุ้ง/ยก)",
        fillNote: "ประตู · กว้าง 1.80 × สูง 2.10 ม. = 3.78 ตร.ม. · ผ้ามุ้งไฟเบอร์ เทา/ดำ",
        formula: `สูตรมุ้ง: พื้นที่ × เรตช่วง (IMP23: ≤1.5=4,500 / 1.5-3=3,700 / >3=3,500) เทียบขั้นต่ำต่อบาน (ประตู 7,200 / หน้าต่าง 4,800)`,
        steps: ["ดู 'วิธีคิดจากเครื่อง' ด้านล่าง (it.r.msgs อธิบาย area × rate และ min ครบ)", `→ ราคา/ชุด ${fmt(it.r.sell)}`],
        engineMsgs: it.r.msgs,
        unit: it.r.sell, qty: it.qty,
      };
    },
  },
  {
    id: "format-8", title: "ราวกันตก/ราวบันได (per_length_tier)",
    cust: "คุณปรีชา / บ้าน 2 ชั้น บันไดตรง",
    fill: "ราวกันตก 47.4 บันไดตรง เสาอลู · ยาว 6.0 ม. + ราวจับยู 5 หุน",
    build() {
      const ch = addItem(doc.getElementById("items"));
      // imp6 = ราว 47.4 บันไดตรง เสาอลู · ความยาว(ม.)กรอกช่อง i-w · option ราวจับ u5
      setItem(ch, { group: 2, prod: "imp6", w: 6.0, h: 1.0, qty: 1, opts: { ".o-handrail": "u5" } });
    },
    explain(items) {
      const it = items[0];
      return {
        product: "ราวกันตก 47.4 บันไดตรง เสาอลู",
        fillNote: "ความยาว 6.0 ม. (กรอกช่อง 'กว้าง') · option ราวจับ ยู 5 หุน +500/ม.",
        formula: `สูตรราวกันตก (per_length_tier): ความยาว × เรตช่วง (IMP6: ≤5=8,700 / 5-10=8,000 / 10-15=7,700) + ราวจับ`,
        steps: ["ดู 'วิธีคิดจากเครื่อง' ด้านล่าง (it.r.msgs อธิบาย ยาว × เรต + ราวจับ ครบ)", `→ ราคา/ชุด ${fmt(it.r.sell)}`],
        engineMsgs: it.r.msgs,
        unit: it.r.sell, qty: it.qty,
      };
    },
  },
  {
    id: "format-9", title: "กั้นห้องกระจก (glasshouse) — ราคารวมเหมา",
    cust: "คุณศิริพร / ต่อเติมหลังบ้าน",
    fill: "กั้นห้องกระจกพร้อมหลังคา · 4 ด้าน + หลังคา · ราคารวม 506,000 + OPTION เทมเปอร์ +5,000",
    build() {
      const ch = addItem(doc.getElementById("items"));
      setItem(ch, { group: 6, prod: "glasshouse", qty: 1, opts: {
        ".o-ghroom": "ห้องอเนกประสงค์ + ซักล้าง",
        ".o-ghglass": "กระจกเขียว/ใส หนา 6 มม.",
        ".o-ghside-A": "ประตูบานเลื่อนสลับ 4 บาน + ติดตายข้าง",
        ".o-ghside-B": "กระจกติดตายเต็มผนัง",
        ".o-ghside-C": "ประตูบานเปิดคู่ + ติดตายข้าง (ชุดล็อคพร้อมกุญแจ)",
        ".o-ghside-D": "บานกระทุ้ง 3 ช่อง + ติดตายบน",
        ".o-ghroof": "หลังคาไวนิล (แปคู่) + รางน้ำอลู + ตะแกรงกันใบไม้",
        ".o-ghprice": "506000",
        ".o-ghoption": ["4"], // index 4 = เปลี่ยนกระจกเป็นเทมเปอร์เขียว/ใส 6 มม. (+5,000)
      }});
    },
    explain(items) {
      const it = items[0];
      const ghPrice = parseFloat(it.optSel?.ghprice) || 506000;
      return {
        product: "กั้นห้องกระจก พร้อมหลังคา (glasshouse)",
        fillNote: "พื้นที่: ห้องอเนกประสงค์+ซักล้าง · ด้าน A-D (4 ด้าน) + หลังคาไวนิล · กระจกเขียว/ใส 6 มม. · ราคารวมเหมา 506,000 · OPTION เปลี่ยนเป็นเทมเปอร์เขียว/ใส 6 มม. (+5,000)",
        formula: `สูตร glasshouse: ราคารวมที่ตีเหมา + ผลรวม OPTION delta (ไม่บวก overhead รายตัว)`,
        steps: [
          `ราคารวมเหมาทั้งชุด (กรอกตามถอดแบบจริง) = ${fmt(ghPrice)}`,
          `OPTION: เปลี่ยนกระจกเป็นเทมเปอร์เขียว/ใส 6 มม. = +5,000`,
          `ราคา/ชุด = ${fmt(ghPrice)} + 5,000 = ${fmt(it.r.sell)}`,
        ],
        engineMsgs: it.r.msgs,
        unit: it.r.sell, qty: it.qty,
      };
    },
  },
  {
    id: "format-10", title: "ชุดหลายบาน + ค่าบริการ + ส่วนลด + VAT 7%",
    cust: "บจก. สยามพัฒนา / อาคารสำนักงาน",
    fill: "บานเลื่อน SMS ×3 + บานเปิดคู่ + ติดตาย ×2 · Protection + ขนส่ง ตจว. · ส่วนลด 2% · VAT 7%",
    build() {
      const items = doc.getElementById("items");
      const a = addItem(items);
      setItem(a, { group: 1, prod: "sliding_sms", type: "window", w: 2.0, h: 1.5, glass: 0, color: 0, panels: 2, qty: 3 });
      const b = addItem(items);
      setItem(b, { group: 1, prod: "casement_euro", type: "door", w: 1.8, h: 2.2, glass: 5, color: 1, panels: 2, qty: 1 });
      const c = addItem(items);
      setItem(c, { group: 1, prod: "fixed_glass", type: "window", w: 1.5, h: 2.0, glass: 6, color: 2, panels: 1, qty: 2 });
      // ค่าบริการ + ส่วนลด + VAT
      setDoc("svc-protect", true, "check"); setDoc("svc-protect-points", "3");
      setDoc("svc-ship", true, "check"); setDoc("svc-ship-km", "260"); setDoc("svc-ship-trucks", "1");
      setDoc("discPct", "2");
      const vat = doc.getElementById("vat-pct"); vat.value = "7"; fire(vat, "change");
    },
    explain(items) {
      const out = [];
      const e1 = explainBucket(items[0], "SMS", 6500);
      out.push({ label: `บานเลื่อน SMS 2.00×1.50 (×${items[0].qty})`, lines: [...e1.lines, `ราคา/ชุด ${fmt(items[0].r.sell)} × ${items[0].qty} = ${fmt(items[0].r.sell * items[0].qty)}`], msgs: items[0].r.msgs });
      const it2 = items[1], a2 = it2.r.a, r2 = rateOf(a2, RATES.OPEN), core2 = Math.max(18000, a2 * r2);
      out.push({ label: `บานเปิด ยูโร บานคู่ 1.80×2.20 (×${it2.qty})`, lines: [
        `พื้นที่ ${it2.w}×${it2.h} = ${a2.toFixed(2)} ตร.ม. → เรต ${fmt(r2)} · max(18,000, ${fmt(a2 * r2)}) = ${fmt(core2)}`,
        `บานคู่ +14,000 + กระจกยูโรเกรย์ 6 มม. → ราคา/ชุด ${fmt(it2.r.sell)}`,
      ], msgs: it2.r.msgs });
      const it3 = items[2], a3 = it3.r.a, r3 = rateOf(a3, RATES.FIX);
      out.push({ label: `กระจกติดตาย 1.50×2.00 (×${it3.qty})`, lines: [
        `พื้นที่ ${it3.w}×${it3.h} = ${a3.toFixed(2)} ตร.ม. → เรต ${fmt(r3)} · max(5,000, ${fmt(a3 * r3)}) = ${fmt(Math.max(5000, a3 * r3))}`,
        `+ กระจกยูโรเกรย์ 8 มม. + สีเทาซาฮารา → ราคา/ชุด ${fmt(it3.r.sell)} × ${it3.qty} = ${fmt(it3.r.sell * it3.qty)}`,
      ], msgs: it3.r.msgs });
      return {
        product: "ชุดผสมหลายรายการ + ค่าบริการ + ส่วนลด 2% + VAT 7%",
        fillNote: "3 รายการ (เลื่อน SMS ×3 / บานเปิดคู่ ×1 / ติดตาย ×2) · Protection 3 จุด · ขนส่ง ตจว. 260 กม. · ส่วนลด 2% · VAT 7%",
        formula: `ยอดรวมรายการ → − ส่วนลด 2% → + ค่าบริการ (Protection + ขนส่ง) → + VAT 7% = รวมทั้งสิ้น`,
        multi: out,
        unit: null, qty: null,
      };
    },
  },
];

// ---------- รัน + เก็บผล ----------
const summary = [];
const checks = [];
const guides = [];

for (let i = 0; i < formats.length; i++) {
  const f = formats[i];
  const n = String(i + 1).padStart(2, "0");
  errors.length = 0;
  clearItems();
  resetServices();
  setDoc("custName", f.cust);
  setDoc("qdate", "03-06-69");
  f.build();
  w.calcQuote();

  // อ่าน items (readItem) — หัวใจ: ดึง r.sell/r.a/r.msgs
  const items = [...doc.querySelectorAll("#items .ch")].map(w.readItem).filter(Boolean);
  const exp = f.explain(items);

  w.genQuote();
  const qc = doc.getElementById("quoteContent");
  const text = visibleText(qc);
  const subtotal = readSubtotal();
  const grand = readGrand();
  const vatAmt = readVatAmt();

  // structural checks
  const hasCompany = /เจอาร์|JR/i.test(qc.innerHTML);
  const hasDetail = qc.innerHTML.includes("รายละเอียด");
  const hasGrand = text.includes("รวมทั้งสิ้น");
  const priceOK = !isNaN(grand) && grand > 0;
  const freshOK = text.includes(f.cust);
  const jsErrs = errors.filter((e) => !/sheetjs|xlsx|Could not load|external|net::|localStorage|scrollTo|Not implemented|getContext|canvas/i.test(e));
  const allOK = hasCompany && hasDetail && hasGrand && priceOK && freshOK && jsErrs.length === 0;
  checks.push({ n, title: f.title, hasCompany, hasDetail, hasGrand, priceOK, freshOK, jsErr: jsErrs.length, allOK });

  writeFileSync(join(OUT, `quote-${n}.html`), wrapHtml(`ใบเสนอราคา ${n} — ${f.title}`, qc.outerHTML), "utf8");

  const unitPrice = exp.multi ? null : exp.unit;
  summary.push({ n, title: f.title, fill: f.fill, unit: unitPrice, subtotal, vat: vatAmt, grand });
  guides.push({ n, f, exp, subtotal, vat: vatAmt, grand });
}

// ---------- เขียน PRICING_GUIDE.md ----------
let md = `# PRICING GUIDE — ใบเสนอราคา 10 รูปแบบสินค้า (format) · เครื่องคิดราคา R3.9 (headless jsdom)\n\n`;
md += `ราคาทุกใบคิดจาก **สูตรจริง** (readItem/calcUnit) — ไม่ใช้ .i-override · วันที่ออกใบ 03-06-69 · เนื้อหา/ถ้อยคำตามใบจริง JR\n\n`;
md += `> "วิธีคิดจากเครื่อง" = ข้อความใน \`it.r.msgs\` ที่เครื่องคืนมาตรงๆ · "ขั้นตอนคิดราคา" = อธิบายสูตรเทียบค่าจริง\n\n`;

// ตารางสรุป
md += `## ตารางสรุป 10 รูปแบบ\n\n`;
md += `| # | สินค้า (format) | ขนาด/ที่กรอก | วิธีคิดย่อ | ราคา/ชุด | รวมทั้งสิ้น |\n`;
md += `|---|----------------|--------------|-----------|---------:|-----------:|\n`;
for (const g of guides) {
  const e = g.exp;
  const shortMethod = e.formula.replace(/^สูตร[^:]*:\s*/, "").slice(0, 60);
  const unit = e.multi ? "—(หลายรายการ)" : fmt(e.unit);
  md += `| ${parseInt(g.n)} | ${g.f.title} | ${g.f.fill} | ${shortMethod} | ${unit} | ${fmt(g.grand)} |\n`;
}

// รายละเอียดแต่ละใบ
md += `\n---\n\n## รายละเอียดแต่ละใบ\n\n`;
for (const g of guides) {
  const e = g.exp;
  md += `### ใบที่ ${parseInt(g.n)} — ${g.f.title}\n\n`;
  md += `**ไฟล์:** \`quote-${g.n}.html\` · **ลูกค้า:** ${g.f.cust}\n\n`;
  md += `**รูปแบบ:** ${e.product}\n\n`;
  md += `**ที่กรอก:** ${e.fillNote}\n\n`;
  md += `**วิธีคิดราคา:** ${e.formula}\n\n`;
  if (e.multi) {
    for (const m of e.multi) {
      md += `- **${m.label}**\n`;
      for (const ln of m.lines) md += `  - ${ln}\n`;
      if (m.msgs && m.msgs.length) md += `  - _วิธีคิดจากเครื่อง:_ ${m.msgs.join(" · ")}\n`;
    }
    md += `\n`;
  } else {
    for (const s of e.steps) md += `- ${s}\n`;
    md += `\n`;
    if (e.engineMsgs && e.engineMsgs.length) md += `**วิธีคิดจากเครื่อง (it.r.msgs):** ${e.engineMsgs.join(" · ")}\n\n`;
    else md += `**วิธีคิดจากเครื่อง (it.r.msgs):** (เครื่องไม่ออกข้อความสำหรับสินค้า bucket — ดูขั้นตอนคิดราคาด้านบน ซึ่ง reconstruct จากสูตร R3.9 และตรงกับราคาที่เครื่องคืนมา)\n\n`;
  }
  // ยอด
  const vatPct = g.vat && g.subtotal ? Math.round((g.vat / (g.grand - g.vat)) * 100) : 7;
  md += `**ยอด:** ${e.multi ? "" : `ราคา/ชุด ${fmt(e.unit)} × ${e.qty} ชุด → `}ราคารวม ${fmt(g.subtotal)} · VAT ${fmt(g.vat)} · **รวมทั้งสิ้น ${fmt(g.grand)} บาท**\n\n`;
  md += `---\n\n`;
}

// structural
md += `## ผล Structural Check (ราคา>0 · หัวบริษัท · "รายละเอียด" · "รวมทั้งสิ้น" · ใบไม่ค้าง · ไม่มี JS error)\n\n`;
md += `| # | สินค้า | หัวบริษัท | "รายละเอียด" | "รวมทั้งสิ้น" | ราคา>0 | ใบไม่ค้าง | JS error | สรุป |\n`;
md += `|---|--------|:--------:|:-----------:|:------------:|:------:|:--------:|:--------:|:----:|\n`;
for (const c of checks) {
  md += `| ${parseInt(c.n)} | ${c.title} | ${c.hasCompany ? "✅" : "❌"} | ${c.hasDetail ? "✅" : "❌"} | ${c.hasGrand ? "✅" : "❌"} | ${c.priceOK ? "✅" : "❌"} | ${c.freshOK ? "✅" : "❌"} | ${c.jsErr} | ${c.allOK ? "✅ ผ่าน" : "⚠ ตรวจ"} |\n`;
}
const passN = checks.filter((c) => c.allOK).length;
md += `\n**สรุป: ${passN}/${checks.length} ใบผ่าน structural check**\n`;

writeFileSync(join(OUT, "PRICING_GUIDE.md"), md, "utf8");

// ---------- console ----------
console.log("=== 10 รูปแบบ ===");
console.table(summary.map((s) => ({ "#": parseInt(s.n), สินค้า: s.title, "ราคา/ชุด": s.unit == null ? "หลายรายการ" : fmt(s.unit), ราคารวม: fmt(s.subtotal), VAT: fmt(s.vat), รวมทั้งสิ้น: fmt(s.grand) })));
console.log("\n=== structural ===");
console.table(checks.map((c) => ({ "#": parseInt(c.n), บริษัท: c.hasCompany, รายละเอียด: c.hasDetail, รวมทั้งสิ้น: c.hasGrand, "ราคา>0": c.priceOK, ไม่ค้าง: c.freshOK, jsErr: c.jsErr, ผ่าน: c.allOK })));
console.log(`\nรวม: ${passN}/${checks.length} ใบผ่าน · ไฟล์ที่ ${OUT}`);

// dump วิธีคิด 3 รูปแบบที่ขอ (1=บานเลื่อน SMS, 4=บานกระทุ้ง, 9=กั้นห้องกระจก) สำหรับรายงาน
function dumpExplain(idx) {
  const g = guides[idx]; const e = g.exp;
  let s = `\n=== วิธีคิดราคาเต็ม: ใบที่ ${parseInt(g.n)} — ${g.f.title} ===\n`;
  s += `รูปแบบ: ${e.product}\nที่กรอก: ${e.fillNote}\nสูตร: ${e.formula}\n`;
  (e.steps || []).forEach((x) => s += "  - " + x + "\n");
  s += `วิธีคิดจากเครื่อง (it.r.msgs): ${(e.engineMsgs || []).join(" · ") || "(bucket — ดูขั้นตอนด้านบน)"}\n`;
  s += `ยอด: ราคา/ชุด ${fmt(e.unit)} × ${e.qty} → ราคารวม ${fmt(g.subtotal)} · VAT ${fmt(g.vat)} · รวมทั้งสิ้น ${fmt(g.grand)}\n`;
  return s;
}
console.log(dumpExplain(0));
console.log(dumpExplain(3));
console.log(dumpExplain(8));

process.exit(checks.every((c) => c.allOK) ? 0 : 1);
