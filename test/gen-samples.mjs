// gen-samples.mjs — สร้างใบเสนอราคาจริง 10 ใบ (ไม่ซ้ำ) จากเครื่องคิดราคา R3.9 แบบ headless (jsdom)
// กฎ: ห้ามใช้ .i-override — ปล่อยให้ readItem/calcUnit คำนวณราคาจริงจากสูตร
// Output: webapp/test/samples/quote-01..10.html (เปิดในเบราว์เซอร์ได้) + SUMMARY.md
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dirname, "../public/calculator/index.html"), "utf8");
const OUT = join(__dirname, "samples");
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

// ---------- helpers ----------
function fire(el, type) { el.dispatchEvent(new w.Event(type, { bubbles: true })); }
// addItem() คืน undefined → ดึง .ch ตัวสุดท้ายที่เพิ่งถูก append ใน container เอง
function addItem(container) { w.addItem(container); const chs = container.querySelectorAll(".ch"); return chs[chs.length - 1]; }
function setField(ch, sel, value) {
  const el = ch.querySelector(sel);
  if (!el) throw new Error("ไม่พบ field " + sel + " ใน .ch");
  el.value = String(value);
  fire(el, "input"); fire(el, "change");
  return el;
}
// ตั้งค่า 1 รายการ (.ch) ให้ครบ: group → prod → type → ขนาด → กระจก/สี/บาน/qty
// ลำดับสำคัญ: set group ก่อน (เพราะ change group จะ rebuild .i-prod options)
function setItem(ch, cfg) {
  if (cfg.group != null) setField(ch, ".i-group", cfg.group);
  if (cfg.prod != null) {
    const prodSel = ch.querySelector(".i-prod");
    // ถ้า option ที่ต้องการไม่อยู่ใน list ปัจจุบัน → rebuild ตาม group ก่อน (กันพลาด)
    if (!prodSel.querySelector('option[value="' + cfg.prod + '"]')) {
      prodSel.innerHTML = w.prodOptionsG6(String(cfg.group || ch.querySelector(".i-group").value));
    }
    prodSel.value = cfg.prod;
    if (prodSel.value !== cfg.prod) throw new Error("เลือก prod ไม่ได้: " + cfg.prod);
    fire(prodSel, "change"); // → buildItemOpts + refreshColorByProduct + refreshItype
  }
  if (cfg.type != null) setField(ch, ".i-type", cfg.type);
  if (cfg.w != null) setField(ch, ".i-w", cfg.w);
  if (cfg.h != null) setField(ch, ".i-h", cfg.h);
  if (cfg.glass != null) setField(ch, ".i-glass", cfg.glass);
  if (cfg.color != null) setField(ch, ".i-color", cfg.color);
  if (cfg.panels != null) setField(ch, ".i-panels", cfg.panels);
  if (cfg.qty != null) setField(ch, ".i-qty", cfg.qty);
  // ตั้งค่า option ภายในรายการ (เช่น มือจับ digi/stainless) ผ่าน selector .o-*
  if (cfg.opts) for (const [sel, val] of Object.entries(cfg.opts)) {
    const oel = ch.querySelector(sel);
    if (oel) {
      if (oel.type === "checkbox") oel.checked = !!val;
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
  // ปิดบริการเสริมทั้งหมด + reset ชั้น/ส่วนลด/VAT กลับ default (VAT 7%)
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
  // reset split state
  w.qSplit = false; w.qSplitGroups = {};
}
function num(s) { const m = String(s || "").replace(/[^\d]/g, ""); return m ? parseInt(m, 10) : NaN; }
function readSubtotal() { const l = doc.querySelector("#quoteContent .qtot .l"); return l ? num(l.textContent) : NaN; }
function readGrand() { const g = doc.querySelector("#quoteContent .qtot .g"); return g ? num(g.textContent) : NaN; }
// อ่าน VAT จากใบ: หาบรรทัด .qtot .l ที่ span แรกขึ้นต้นด้วย "VAT" แล้วอ่านเฉพาะ span ที่สอง
function readVatAmt() {
  const rows = [...doc.querySelectorAll("#quoteContent .qtot .l")];
  for (const r of rows) {
    const spans = r.querySelectorAll("span");
    if (spans.length >= 2 && /^VAT/.test((spans[0].textContent || "").trim())) return num(spans[1].textContent);
  }
  return NaN;
}
// นับจำนวนแถวรายการในตารางใบเสนอ (กันกรณี genQuote fallback แล้วเหลือใบเก่าค้าง)
function countQuoteRows() { return doc.querySelectorAll("#quoteContent table.qt tbody tr").length; }
function visibleText(el) { return (el.textContent || "").replace(/ /g, " ").replace(/\s+/g, " ").trim(); }

// CSS รวมจาก <style> ทุกตัวในหน้า calculator
const ALL_CSS = [...doc.querySelectorAll("style")].map((s) => s.textContent).join("\n");

function wrapHtml(title, inner) {
  return `<!doctype html><html lang="th"><head><meta charset="utf-8">`
    + `<meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<title>${title}</title><style>\n${ALL_CSS}\n</style></head>`
    + `<body style="background:#eee;padding:20px;">${inner}</body></html>`;
}

// ---------- 10 สถานการณ์ ----------
// แต่ละ build() คืน array ของ .ch ที่จะตั้งค่า + ตั้ง doc-level fields เอง
// คืนค่า {scenario, custName, items:[{label,...}]} ผ่าน closure ของ runner
const scenarios = [
  {
    name: "หน้าต่างบานเลื่อนสลับ เดี่ยว",
    cust: "คุณสมชาย / บ้านเดี่ยว ซ.ลาดพร้าว",
    short: "หน้าต่างบานเลื่อน SMS 1.80×1.20 กระจกเขียว 6มม.",
    build() {
      const ch = addItem(doc.getElementById("items"));
      setItem(ch, { group: 1, prod: "sliding_sms", type: "window", w: 1.8, h: 1.2, glass: 0, color: 0, panels: 2, qty: 1 });
    },
  },
  {
    name: "ประตูบานเปิดคู่ + มือจับสแตนเลส",
    cust: "คุณวิภา / ทาวน์โฮม รังสิต",
    short: "ประตูบานเปิดยูโร 1.60×2.20 บานคู่ + มือจับสแตนเลส 60ซม.",
    build() {
      const ch = addItem(doc.getElementById("items"));
      setItem(ch, { group: 1, prod: "casement_euro", type: "door", w: 1.6, h: 2.2, glass: 13, color: 1, panels: 2, qty: 1,
        opts: { ".o-stainless": "2" } }); // .o-stainless = index ใน HANDLE_STAINLESS · 2 = 60 ซม. (+2,000)
    },
  },
  {
    name: "ชุด 3 บาน group เดียว (dedup วัสดุ)",
    cust: "คุณปีเตอร์ / คอนโดสุขุมวิท",
    short: "ชุดหน้าต่างห้องนอน 3 บาน (เลื่อน SMS) กระจกเขียว 6มม. เหมือนกัน",
    build() {
      const set = w.addSet();
      const parts = set.querySelector(".set-parts");
      w.addItem(parts); w.addItem(parts); // รวม 3 ส่วน
      const sn = set.querySelector(".set-name"); sn.value = "ชุดหน้าต่างห้องนอน"; fire(sn, "input");
      const chs = [...set.querySelectorAll(".ch")];
      const sizes = [[1.8, 1.2], [1.5, 1.2], [2.0, 1.3]];
      chs.forEach((ch, i) => setItem(ch, { group: 1, prod: "sliding_sms", type: "window",
        w: sizes[i][0], h: sizes[i][1], glass: 0, color: 0, panels: 2, qty: 1 }));
    },
  },
  {
    name: "บานกระทุ้ง + มุ้งเฟรมเล็ก",
    cust: "คุณนภา / บ้านสวน นครปฐม",
    short: "บานกระทุ้งยูโร 0.90×0.60 + มุ้งเฟรมเล็กติดตาย",
    build() {
      const items = doc.getElementById("items");
      const ch1 = addItem(items);
      setItem(ch1, { group: 1, prod: "awning_euro", type: "window", w: 0.9, h: 0.6, glass: 0, color: 0, panels: 1, qty: 1 });
      const ch2 = addItem(items);
      setItem(ch2, { group: 5, prod: "imp22", type: "window", w: 0.9, h: 0.6, qty: 1 });
    },
  },
  {
    name: "บานกระจกติดตาย ขนาดใหญ่",
    cust: "บจก. ทรัพย์มงคล / โชว์รูม",
    short: "กระจกติดตาย 3.00×2.80 ยูโรเกรย์ 8มม.",
    build() {
      const ch = addItem(doc.getElementById("items"));
      setItem(ch, { group: 1, prod: "fixed_glass", type: "window", w: 3.0, h: 2.8, glass: 6, color: 2, panels: 1, qty: 1 });
    },
  },
  {
    name: "งานกลุ่ม 2 — ราวกันตกบันได",
    cust: "คุณธีระ / บ้าน 2 ชั้น",
    short: "ราวกันตก 47.4 บันไดตรง เสาอลู (ยาว 6 ม.)",
    build() {
      const ch = addItem(doc.getElementById("items"));
      // ราวบันได imp6 method per_length_tier — i-w = ความยาว(ม.)
      setItem(ch, { group: 2, prod: "imp6", w: 6.0, h: 1.0, qty: 1 });
    },
  },
  {
    name: "งานกลุ่ม 5 — มุ้งเฟรมใหญ่",
    cust: "คุณกมล / รีโนเวทบ้าน",
    short: "มุ้งเฟรมใหญ่ (เลื่อน/เปิด) 1.80×2.10",
    build() {
      const ch = addItem(doc.getElementById("items"));
      setItem(ch, { group: 5, prod: "imp23", type: "door", w: 1.8, h: 2.1, qty: 1 });
    },
  },
  {
    name: "ชุดผสม + ค่าบริการ (Protection + ขนส่ง)",
    cust: "คุณอรุณ / ต่างจังหวัด โคราช",
    short: "บานเลื่อนยูโร + กระจกติดตาย + Protection + ค่าขนส่ง ตจว.",
    build() {
      const items = doc.getElementById("items");
      const ch1 = addItem(items);
      setItem(ch1, { group: 1, prod: "sliding_euro", type: "door", w: 2.4, h: 2.2, glass: 13, color: 1, panels: 2, qty: 1 });
      const ch2 = addItem(items);
      setItem(ch2, { group: 1, prod: "fixed_glass", type: "window", w: 1.2, h: 1.5, glass: 0, color: 1, panels: 1, qty: 2 });
      // เปิดค่าบริการ
      setDoc("svc-protect", true, "check"); setDoc("svc-protect-points", "2");
      setDoc("svc-ship", true, "check"); setDoc("svc-ship-km", "260"); setDoc("svc-ship-trucks", "1");
    },
  },
  {
    name: "หลายรายการ + ส่วนลด 2% + VAT 7%",
    cust: "บจก. สยามพัฒนา / อาคารสำนักงาน",
    short: "บานเลื่อน + บานเปิด + ติดตาย หลายชุด · ส่วนลด 2% · VAT 7%",
    build() {
      const items = doc.getElementById("items");
      const a = addItem(items);
      setItem(a, { group: 1, prod: "sliding_sms", type: "window", w: 2.0, h: 1.5, glass: 0, color: 0, panels: 2, qty: 3 });
      const b = addItem(items);
      setItem(b, { group: 1, prod: "casement_euro", type: "door", w: 1.8, h: 2.2, glass: 13, color: 1, panels: 2, qty: 1 });
      const c = addItem(items);
      setItem(c, { group: 1, prod: "fixed_glass", type: "window", w: 1.5, h: 2.0, glass: 6, color: 2, panels: 1, qty: 2 });
      setDoc("discPct", "2"); // ส่วนลด 2% (ยอดต้อง ≥ 50,000 ถึงจะใช้ได้)
      const vat = doc.getElementById("vat-pct"); vat.value = "7"; fire(vat, "change");
    },
  },
  {
    // หมายเหตุ: ไม่มีช่อง "หัก ณ ที่จ่าย" ในเครื่องคิดราคา และ glasshouse (group 6)
    // คำนวณ area=0 → genQuote จะตัดทิ้ง (ราคา>0 ไม่ผ่าน) → ใช้ shower กั้นห้องกระจกอาบน้ำแทน (กระจกกั้นห้องจริง คิดจากสูตร) + VAT 0%
    name: "VAT 0% — กั้นห้องกระจกอาบน้ำ (shower)",
    cust: "คุณศิริพร / คอนโด (ไม่ขอใบกำกับ)",
    short: "shower กั้นห้องอาบน้ำ 1.20×2.00 เทมเปอร์ใสพิเศษ 6มม. + อุปกรณ์ดำ · VAT 0%",
    build() {
      const ch = addItem(doc.getElementById("items"));
      setItem(ch, { group: 1, prod: "shower", type: "door", w: 1.2, h: 2.0, glass: 17, color: 1, panels: 1, qty: 1,
        opts: { ".o-blackhw": true } }); // shower opt: อุปกรณ์ดำ +4,000
      const vat = doc.getElementById("vat-pct"); vat.value = "0"; fire(vat, "change");
    },
  },
];

// ---------- รัน 10 ใบ ----------
const summary = [];
const checks = [];

for (let i = 0; i < scenarios.length; i++) {
  const sc = scenarios[i];
  const n = String(i + 1).padStart(2, "0");
  errors.length = 0;
  clearItems();
  resetServices();
  setDoc("custName", sc.cust);
  setDoc("qdate", "02-06-69");
  sc.build();
  w.calcQuote();
  w.genQuote();

  const qc = doc.getElementById("quoteContent");
  const text = visibleText(qc);
  const innerHTML = qc.innerHTML;
  const subtotal = readSubtotal();
  const grand = readGrand();
  const vatAmt = readVatAmt();

  // structural checks
  const hasCompany = /เจอาร์|JR/i.test(innerHTML);
  const hasDetailHdr = innerHTML.includes("รายละเอียด");
  const hasGrandLabel = text.includes("รวมทั้งสิ้น");
  const priceOK = !isNaN(grand) && grand > 0;
  // กันใบค้าง: ใบที่ render ต้องโชว์ชื่อลูกค้าของสถานการณ์นี้ (พิสูจน์ว่า genQuote สร้างใหม่จริง)
  const freshOK = text.includes(sc.cust);
  // dedup: เฉพาะใบที่ 3 (ชุด 3 บาน กระจกเหมือนกัน) — กระจกต้องปรากฏ 1 ครั้ง
  let dedupNote = "—";
  if (i === 2) {
    const gname = "กระจกเขียว 6 มม.";
    let cnt = 0, idx = 0; while ((idx = text.indexOf(gname, idx)) !== -1) { cnt++; idx += gname.length; }
    dedupNote = cnt === 1 ? "ผ่าน (1 ครั้ง)" : ("⚠ " + cnt + " ครั้ง");
  }
  const jsErrs = errors.filter((e) => !/sheetjs|xlsx|Could not load|external|net::|localStorage|scrollTo|Not implemented|getContext|canvas/i.test(e));

  const allOK = hasCompany && hasDetailHdr && hasGrandLabel && priceOK && freshOK && jsErrs.length === 0 && (i !== 2 || dedupNote.startsWith("ผ่าน"));
  checks.push({ n, name: sc.name, hasCompany, hasDetailHdr, hasGrandLabel, priceOK, freshOK, dedupNote, jsErr: jsErrs.length, allOK });

  // เซฟไฟล์ HTML
  const file = join(OUT, `quote-${n}.html`);
  writeFileSync(file, wrapHtml(`ใบเสนอราคา ${n} — ${sc.name}`, qc.outerHTML), "utf8");

  summary.push({ n, scenario: sc.name, short: sc.short, subtotal, vat: vatAmt, grand });

  // เก็บ plain text ของใบที่ 3 และ 9 ไว้แปะรายงาน
  if (i === 2 || i === 8) {
    sc._dump = visibleText(qc);
  }
}

// ---------- เขียน SUMMARY.md ----------
const fmt = (x) => (isNaN(x) ? "—" : x.toLocaleString("en-US"));
let md = `# SUMMARY — ใบเสนอราคาจริง 10 ใบ (เครื่องคิดราคา R3.9, headless jsdom)\n\n`;
md += `สร้างจากสูตรจริง (readItem/calcUnit) — **ไม่ใช้ .i-override** · วันที่ออกใบ 02-06-69\n\n`;
md += `## ตารางสรุป\n\n`;
md += `| # | สถานการณ์ | รายการ (ย่อ) | ราคารวม | VAT | รวมทั้งสิ้น |\n`;
md += `|---|-----------|--------------|--------:|----:|-----------:|\n`;
for (const s of summary) {
  md += `| ${parseInt(s.n)} | ${s.scenario} | ${s.short} | ${fmt(s.subtotal)} | ${fmt(s.vat)} | ${fmt(s.grand)} |\n`;
}
md += `\n## ผล Structural Check\n\n`;
md += `| # | หัวบริษัท | "รายละเอียด" | "รวมทั้งสิ้น" | ราคา>0 | ใบไม่ค้าง | dedup (ใบ3) | JS error | สรุป |\n`;
md += `|---|:--------:|:-----------:|:------------:|:------:|:-------:|:----------:|:-------:|:----:|\n`;
for (const c of checks) {
  md += `| ${parseInt(c.n)} | ${c.hasCompany ? "✅" : "❌"} | ${c.hasDetailHdr ? "✅" : "❌"} | ${c.hasGrandLabel ? "✅" : "❌"} | ${c.priceOK ? "✅" : "❌"} | ${c.freshOK ? "✅" : "❌"} | ${c.dedupNote} | ${c.jsErr} | ${c.allOK ? "✅ ผ่าน" : "⚠ ตรวจ"} |\n`;
}
md += `\n## ไฟล์ HTML (เปิดในเบราว์เซอร์ได้)\n\n`;
for (const s of summary) md += `- quote-${s.n}.html — ${s.scenario}\n`;
writeFileSync(join(OUT, "SUMMARY.md"), md, "utf8");

// ---------- console output สำหรับ inspect ----------
console.log("=== สรุป 10 ใบ ===");
console.table(summary.map((s) => ({ "#": parseInt(s.n), สถานการณ์: s.scenario, ราคารวม: fmt(s.subtotal), VAT: fmt(s.vat), รวมทั้งสิ้น: fmt(s.grand) })));
console.log("\n=== structural ===");
console.table(checks.map((c) => ({ "#": parseInt(c.n), บริษัท: c.hasCompany, รายละเอียด: c.hasDetailHdr, รวมทั้งสิ้น: c.hasGrandLabel, "ราคา>0": c.priceOK, ไม่ค้าง: c.freshOK, dedup: c.dedupNote, jsErr: c.jsErr, ผ่าน: c.allOK })));

console.log("\n=== DUMP ใบที่ 3 (ชุด 3 บาน) ===\n" + (scenarios[2]._dump || ""));
console.log("\n=== DUMP ใบที่ 9 (ส่วนลด+VAT) ===\n" + (scenarios[8]._dump || ""));

const allPass = checks.every((c) => c.allOK);
console.log("\nรวม: " + checks.filter((c) => c.allOK).length + "/" + checks.length + " ใบผ่าน structural");
process.exit(allPass ? 0 : 1);
