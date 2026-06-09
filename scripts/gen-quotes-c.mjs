// gen-quotes-c.mjs — ใบ FullC = 20 รายการผสมออปชันซับซ้อน (stress-test option combos)
// เลียนแบบ gen-quotes-full.mjs: JSDOM โหลด index.html, addItem, เลือก option เอง, calcQuote, genQuote
// เขียน ใบเสนอราคาทดสอบ/quote-FULL-C.html
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT = join(ROOT, "ใบเสนอราคาทดสอบ");
mkdirSync(OUT, { recursive: true });

const calcHtml = readFileSync(join(ROOT, "public/calculator/index.html"), "utf8");
const STYLE = (calcHtml.match(/<style>([\s\S]*?)<\/style>/) || [, ""])[1];
const dom = new JSDOM(calcHtml, {
  runScripts: "dangerously",
  pretendToBeVisual: true,
  virtualConsole: new VirtualConsole(),
  url: "http://localhost/",
});
await new Promise((r) => {
  dom.window.addEventListener("load", r);
  setTimeout(r, 1500);
});
const w = dom.window, doc = w.document;
const fire = (el, t) => el.dispatchEvent(new w.Event(t, { bubbles: true }));

// ปิด svc-protect ถ้าเปิดอยู่
{ const sp = doc.getElementById("svc-protect"); if (sp && sp.checked) { sp.checked = false; fire(sp, "change"); } }

function setF(ch, sel, v) {
  const el = ch.querySelector(sel);
  if (el) { el.value = String(v); fire(el, "input"); fire(el, "change"); }
}
function setFChecked(ch, sel, checked) {
  const el = ch.querySelector(sel);
  if (el) { el.checked = checked; fire(el, "change"); }
}
function setF2(id, v) {
  const el = doc.getElementById(id);
  if (el) { el.value = String(v); fire(el, "input"); fire(el, "change"); }
}
function clearItems() { doc.getElementById("items").innerHTML = ""; }

// ดึง PRODUCTS จาก window
w.eval("window.__PRODUCTS__ = PRODUCTS;");
const ALL_PRODUCTS = w.__PRODUCTS__;

// addItem สร้างรายการใหม่ ตั้งค่าพื้นฐาน คืน ch element
function addItem(it) {
  w.addItem(doc.getElementById("items"));
  const chs = doc.querySelectorAll("#items .ch");
  const ch = chs[chs.length - 1];

  setF(ch, ".i-group", it.g);
  const ps = ch.querySelector(".i-prod");
  if (!ps.querySelector('option[value="' + it.prod + '"]')) {
    ps.innerHTML = w.prodOptionsG6(String(it.g));
  }
  ps.value = it.prod;
  fire(ps, "change");

  if (it.w != null) setF(ch, ".i-w", it.w);
  if (it.h != null) setF(ch, ".i-h", it.h);
  if (it.panels != null) setF(ch, ".i-panels", it.panels);
  if (it.qty != null) setF(ch, ".i-qty", it.qty);
  if (it.pos) setF(ch, ".i-position", it.pos);
  if (it.itype) setF(ch, ".i-type", it.itype);
  if (it.override != null) setF(ch, ".i-override", it.override);

  // ตั้ง opts เฉพาะ (selector → value)
  for (const [sel, val] of Object.entries(it.opts || {})) {
    if (typeof val === "boolean") {
      setFChecked(ch, sel, val);
    } else {
      setF(ch, sel, val);
    }
  }

  if (it.note) setF(ch, ".i-note", it.note);
  return ch;
}

// addGlasshouseSet2: สร้างชุดกั้นห้องกระจก (ระบบชุด)
function addGlasshouseSet2(cfg) {
  const sb = w.addGlasshouseSet();
  const sn = sb.querySelector(".set-name");
  if (sn) { sn.value = cfg.name || "กั้นห้องกระจก"; fire(sn, "input"); fire(sn, "change"); }

  const parts = sb.querySelector(".set-parts");
  const sides = cfg.sides || [];

  if (sides.length > 0) {
    let chs = parts.querySelectorAll(".ch");
    const s0 = sides[0];
    const ch0 = chs[0];
    if (s0.prod) {
      const ps = ch0.querySelector(".i-prod");
      if (ps && !ps.querySelector('option[value="' + s0.prod + '"]')) ps.innerHTML = w.prodOptionsG6("6");
      if (ps) { ps.value = s0.prod; fire(ps, "change"); }
    }
    if (s0.w != null) setF(ch0, ".i-w", s0.w);
    if (s0.h != null) setF(ch0, ".i-h", s0.h);
    const pA = ch0.querySelector(".i-position");
    if (pA) { pA.value = s0.pos || "ด้าน A"; fire(pA, "input"); fire(pA, "change"); }
    // opts สำหรับด้านนี้
    for (const [sel, val] of Object.entries(s0.opts || {})) {
      if (typeof val === "boolean") setFChecked(ch0, sel, val);
      else setF(ch0, sel, val);
    }

    for (let i = 1; i < sides.length; i++) {
      const addBtn = sb.querySelector(".set-addpart");
      if (addBtn) fire(addBtn, "click");
      chs = parts.querySelectorAll(".ch");
      const chN = chs[chs.length - 1];
      const sN = sides[i];
      if (sN.prod) {
        const ps = chN.querySelector(".i-prod");
        if (ps && !ps.querySelector('option[value="' + sN.prod + '"]')) ps.innerHTML = w.prodOptionsG6("6");
        if (ps) { ps.value = sN.prod; fire(ps, "change"); }
      }
      if (sN.w != null) setF(chN, ".i-w", sN.w);
      if (sN.h != null) setF(chN, ".i-h", sN.h);
      const pN = chN.querySelector(".i-position");
      if (pN) { pN.value = sN.pos || ("ด้าน " + String.fromCharCode(64 + i + 1)); fire(pN, "input"); fire(pN, "change"); }
      for (const [sel, val] of Object.entries(sN.opts || {})) {
        if (typeof val === "boolean") setFChecked(chN, sel, val);
        else setF(chN, sel, val);
      }
    }
  }

  if (cfg.roof) {
    const roofBtn = sb.querySelector(".set-addroof");
    if (roofBtn) fire(roofBtn, "click");
    const chs = parts.querySelectorAll(".ch");
    const roofCh = chs[chs.length - 1];
    const r = cfg.roof;
    if (r.prod) {
      const ps = roofCh.querySelector(".i-prod");
      if (ps) { ps.value = r.prod; fire(ps, "change"); }
    }
    if (r.w != null) setF(roofCh, ".i-w", r.w);
    if (r.h != null) setF(roofCh, ".i-h", r.h);
    const rPos = roofCh.querySelector(".i-position");
    if (rPos && !rPos.value.trim()) { rPos.value = "หลังคา"; fire(rPos, "input"); }
    for (const [sel, val] of Object.entries(r.opts || {})) {
      if (typeof val === "boolean") setFChecked(roofCh, sel, val);
      else setF(roofCh, sel, val);
    }
  }

  return sb;
}

// ===== FullC: 20 รายการผสมออปชันซับซ้อน =====
// แต่ละรายการใส่ออปชันหลายตัวพร้อมกัน — stress-test option combos
const jobC = {
  cust: "คุณเทสต์ ออปชันผสม (FullC stress-test)",
  date: "08-06-69",
  discFlat: 5000,
  items: [
    // #1 บานเลื่อนยูโร + คาดตาราง + ชุดล็อค + ธรณี(via enableAllOpts ไม่ได้ — ไม่มีใน items นี้, ใส่ opts เอง) + มุ้งในบาน
    {
      g: 1, prod: "sliding_euro", pos: "ประตูบานเลื่อน ยูโร 4 บาน (หน้าบ้าน)", w: 3.6, h: 2.4, panels: 4, qty: 1,
      opts: {
        ".o-slidelock": "มีกุญแจ",
        ".o-gridmark": true,        // คาดตาราง
        ".o-mosq": "imp23",          // มุ้งเฟรมใหญ่ในบาน
      },
    },
    // #2 บานเปิดยูโร ประตู + ธรณีหลังเต่า + คาดตาราง + มุ้งในบาน + ชุดล็อค
    {
      g: 1, prod: "casement_euro", pos: "ประตูบานเปิด ยูโร (ห้องนอนใหญ่)", itype: "door", w: 0.9, h: 2.1, panels: 1, qty: 1,
      opts: {
        ".o-thresh": "turtle",       // ธรณีหลังเต่า +1,000
        ".o-gridmark": true,         // คาดตาราง
        ".o-mosq": "imp22",          // มุ้งเฟรมเล็กติดตาย
      },
    },
    // #3 บานเฟี้ยมยูโร + เสริมคาน + มุ้ง + ธรณีภายนอก
    {
      g: 1, prod: "folding_euro", pos: "บานเฟี้ยม ยูโร (เชื่อมระเบียง)", w: 3.6, h: 2.4, panels: 4, qty: 1,
      opts: {
        ".o-beam": true,             // เสริมคาน
        ".o-threshf": "outer",       // ธรณีกันน้ำภายนอก
        ".o-mosq": "imp21",          // มุ้งเฟรมเล็ก
      },
    },
    // #4 บานกระทุ้ง tilt&turn (awning_euro) + มุ้งในบาน + ธรณีหลังเต่า
    {
      g: 1, prod: "awning_euro", pos: "หน้าต่างบานกระทุ้ง (ห้องน้ำชั้น 1)", itype: "window", w: 0.8, h: 1.0, qty: 2,
      opts: {
        ".o-mosq": "imp21",          // มุ้งเฟรมเล็ก
        ".o-mosqfabric": "anti_pet", // ผ้ากันแมว/หมา
      },
    },
    // #5 ลูกฟูกเรียบ 1 ทาง + อบสีลายไม้สต๊อก (ranae fin)
    {
      g: 1, prod: "rn89", pos: "ลูกฟูกเรียบ 1 ทาง (กันสาดหน้าบ้าน)", w: 3.0, h: 2.4, qty: 1,
      opts: {
        ".o-finish": "2500",         // สีลายไม้สต๊อก
        ".o-hmode": "round",
      },
    },
    // #6 คอมโพสิต 3 มม. (ลูกฟูก+คอมโพสิททึบ) — ไม่มี fin → ราคาพื้นฐาน
    {
      g: 1, prod: "rn91", pos: "คอมโพสิต 3 มม. (อลูทึบล่าง กั้นห้อง)", w: 2.4, h: 1.2, qty: 1,
      opts: { ".o-hmode": "splice" },
    },
    // #7 คอมโพสิต 4 มม. — ไม่มี fin (ไม่มี .fin prop) + ทำประตูบานเลื่อน
    {
      g: 1, prod: "rn92", pos: "คอมโพสิต 4 มม. (ผนังห้องน้ำ)", w: 1.8, h: 2.0, qty: 1,
      opts: { ".o-doortype": "sliding_euro" },  // ทำเป็นประตูบานเลื่อน
    },
    // #8 ระแนงเกล็ด Z 1" รวมโครง + อบสีพิเศษ
    {
      g: 2, prod: "rn84", pos: "ระแนงเกล็ด Z 1\" รวมโครง (รั้วรอบบ้าน)", w: 4.0, h: 1.8, qty: 1,
      opts: { ".o-finish": "1500" }, // อบสีพิเศษ
    },
    // #9 ประตูรั้ว fence_gate + มอเตอร์ 1 ตัว + ราง straight + ครีบ rn89 + อบสีดำ
    {
      g: 2, prod: "fence_gate", pos: "ประตูรั้วบานเลื่อน (ประตูรั้วหน้าบ้าน)", w: 4.0, h: 2.0, qty: 1,
      opts: {
        ".o-gatern": "rn89",         // ลายระแนง ลูกฟูกเรียบ 1 ทาง
        ".o-gmotor": "1",            // มอเตอร์ 1 ตัว
        ".o-railtype": "straight",   // ราง ตรง
        ".o-gfin": "สีดำ",           // อบสีดำ
      },
    },
    // #10 หลังคาไวนิล + แปคู่ + ปิดปลาย + สีน้ำตาล + รางน้ำ S + เสาแผง
    {
      g: 3, prod: "roof_vinyl", pos: "หลังคาไวนิล (กันสาดรถยนต์)", w: 6.0, h: 3.5, qty: 1,
      opts: {
        ".o-roofcolor": "สีน้ำตาล",
        ".o-roofbatten": "แปคู่",
        ".o-roofend": "ปิดปลาย",
        ".o-rfeave": "6",            // ปิดปลายกันน้ำ 6 ม.
        ".o-rfgut": "1000",          // รางน้ำอลู S
        ".o-rfgutlen": "6",          // ยาว 6 ม.
        ".o-rfpolep": "4",           // เสาแผง 4 ต้น
      },
    },
    // #11 หลังคาดีไลท์ + แปคู่ + รางน้ำ (ท่อ สีดำ) + ซ่อนสโลปคอมโพสิต
    {
      g: 3, prod: "roof_delight", pos: "หลังคาดีไลท์ (ระเบียงหลังบ้าน)", w: 4.0, h: 3.0, qty: 1,
      opts: {
        ".o-roofcolor": "DG-4 สีเทาโซล่าร์",
        ".o-roofbatten": "แปคู่",
        ".o-roofend": "รางน้ำ",
        ".o-guttersys": "ท่อ",
        ".o-gutter-pipecolor": "ดำ",
        ".o-rfhs": "comp",           // ซ่อนสโลปคอมโพสิต
        ".o-rfhsh": "0.3",           // สูง 0.3 ม.
        ".o-rfhsl": "4",             // ยาว 4 ม.
        ".o-rfhsn": "1",             // 1 ด้าน
      },
    },
    // #12 หลังคาโพลีตัน 3มม. + แปคู่ + รางน้ำ (โซ่ทิวลิป สีน้ำตาล) + ปิดปลาย
    {
      g: 3, prod: "roof_polyton", pos: "หลังคาโพลีตัน (ระเบียงชั้น 2)", w: 3.0, h: 2.5, qty: 1,
      opts: {
        ".o-roofcolor": "Bronze 107 สีชาใส (แสงผ่าน 30%)",
        ".o-roofbatten": "แปคู่",
        ".o-roofend": "รางน้ำ",
        ".o-guttersys": "โซ่",
        ".o-gutter-chainpat": "ทิวลิป",
        ".o-gutter-chaincolor": "น้ำตาล",
        ".o-rfchain": "2",           // โซ่รางน้ำ 2 เส้น
        ".o-rfeave": "3",            // ปิดปลาย 3 ม.
      },
    },
    // #13 shower door+fixed + เข้ามุม + อุปกรณ์ดำ
    {
      g: 1, prod: "shower", pos: "Shower ห้องน้ำ master (ประตู+ติดตาย เข้ามุม)", w: 1.5, h: 2.0, qty: 1,
      auto: false,
      opts: {
        ".o-shtype": "door_fixed",
        ".o-shdoortype": "swing",
      },
    },
    // #14 บานเลื่อนภายใน SlimLux + คาดตาราง
    {
      g: 1, prod: "inner_top_slimlux", pos: "เลื่อนภายในรางบน SlimLux (ห้องนั่งเล่น)", w: 3.0, h: 2.4, panels: 3, qty: 1,
      opts: {
        ".o-gridmark": true,
        ".o-beamm": "2400",          // เสริมคานเหล็กถักรุ่น 1
        ".o-beammlen": "3",
      },
    },
    // #15 มุ้งเฟรมใหญ่ standalone + สีกรอบมุ้ง + ผ้ากันแมว
    {
      g: 5, prod: "imp23", pos: "มุ้งเฟรมใหญ่ (ประตูระเบียง — ลูกค้าเก่าเพิ่มมุ้ง)", w: 1.8, h: 2.1, qty: 2,
      opts: {
        ".o-screen_existing": true,  // โหมด B ติดบานเดิม
        ".o-screen_extra": "2000",   // ค่าเสริมกล่อง/ราง
        ".o-screenfabric": "cat",    // ผ้ากันแมว/หมา
        ".o-mscolor": "3",           // สีกรอบมุ้งพิเศษ (index 3 ใน COLORS)
      },
    },
    // #16 ม่านซิป auto ผ้า 5% + มอเตอร์ AOK 220V
    {
      g: 7, prod: "zipscreen", pos: "ม่านซิป ระเบียงหน้า (auto 5%)", w: 4.0, h: 2.8, qty: 1,
      auto: false,
      opts: {
        ".o-zgrp": "retail",
        ".o-zmodel": "auto",
        ".o-zfab": "5",
        ".o-zctrl": "aok220",
      },
    },
    // #17 ระแนงผนัง 1"x1.6" ไม่โครง + อบสีลายไม้ + ทำประตูบานเปิด
    {
      g: 2, prod: "rn37", pos: "ระแนงผนัง 1\"x1.6\" (รั้วข้างบ้าน)", w: 5.0, h: 1.8, qty: 1,
      opts: {
        ".o-finish": "1600",         // สีลายไม้สต๊อก
        ".o-doortype": "casement_euro",
        ".o-hmode": "splice",
      },
    },
    // #18 กั้นห้องกระจก (ชุด): ด้าน A บานเลื่อน + ด้าน B ติดตาย + คาดตาราง ด้าน A + หลังคาดีไลท์
    // (ดูหมายเหตุด้านล่าง — นับเป็น 1 รายการ ชุด)
    // handled via ghSets below

    // #19 บานเปลือยสวิง + สีดำ + มุ้ง
    {
      g: 1, prod: "frameless_door", pos: "ประตูบานเปลือย สวิง (ห้องน้ำล่าง)", w: 0.8, h: 2.0, qty: 1,
      auto: false,
      opts: {
        ".o-frametype": "swing",
        ".o-framecolor": "ดำ",
      },
    },
    // #20 PC Door 4 บาน + เสริมคานเหล็กถัก + คาดตาราง + มุ้งในบาน
    {
      g: 1, prod: "pc_door_4", pos: "PC Door 4 บาน (ประตูร้านค้า)", w: 3.6, h: 2.4, qty: 1,
      opts: {
        ".o-beamm": "3600",          // คานเหล็กถักรุ่น 2
        ".o-beammlen": "3.6",
        ".o-gridmark": true,
        ".o-mosq": "imp31",          // มุ้งจีบนิรภัย
      },
    },
  ],

  // กั้นห้องกระจก (รายการ #18) — นับเป็น 1 ชุด ใส่หลังรายการปกติทั้งหมด
  ghSets: [
    {
      name: "กั้นห้องกระจก (ครัว+ระเบียง) [FullC #18]",
      sides: [
        {
          prod: "sliding_euro", w: 3.0, h: 2.4, pos: "ด้าน A (เลื่อน)",
          opts: { ".o-gridmark": true },  // คาดตาราง ด้าน A
        },
        {
          prod: "fixed_glass", w: 2.0, h: 2.4, pos: "ด้าน B (ติดตาย)",
        },
        {
          prod: "casement_euro", w: 1.2, h: 2.4, pos: "ด้าน C (บานเปิด)",
          opts: { ".o-thresh": "turtle" }, // ธรณีหลังเต่า
        },
      ],
      roof: {
        prod: "roof_delight", w: 7.2, h: 2.5,
        opts: {
          ".o-roofcolor": "DG-2 สีฟ้าคราม",
          ".o-roofbatten": "แปคู่",
          ".o-roofend": "ปิดปลาย",
          ".o-rfeave": "7.2",
        },
      },
    },
  ],
};

// ===== render =====
function render(job, code) {
  clearItems();
  setF2("discFlat", job.discFlat || 0);
  setF2("discPct", 0);
  setF2("custName", job.cust);
  setF2("qdate", job.date);
  setF2("sellerName", "เซลล์ทดสอบ C");
  setF2("custContact", job.cust + " (Line)");
  setF2("custPhone", "08X-XXX-XXXX");
  setF2("custAddress", "เลขที่ — หมู่ — ต.— อ.— จ.— 00000 (ที่อยู่ทดสอบ FullC)");

  // ปิด calcQuote ชั่วคราวเพื่อประสิทธิภาพ
  w.eval("window._calcQuoteOrig = calcQuote; calcQuote = function(){};");

  // เพิ่มรายการปกติทั้งหมด
  job.items.forEach(addItem);

  // กั้นห้องกระจก ต่อท้าย
  if (job.ghSets && job.ghSets.length) {
    for (const cfg of job.ghSets) addGlasshouseSet2(cfg);
  }

  w.eval("calcQuote = window._calcQuoteOrig;");
  w.calcQuote();
  w.genQuote();

  const inner = doc.getElementById("quoteContent").innerHTML;
  const out = `<!doctype html><html lang="th"><head><meta charset="utf-8"><style>
${STYLE}
@page{size:A4;margin:9mm 9mm 18mm 9mm;}
html,body{background:#fff !important;}
#sheet{max-width:800px;margin:0 auto;background:#fff;}
.quote{box-shadow:none !important;border-radius:0 !important;background:#fff !important;color:#1f2937 !important;max-width:100% !important;}
@media print{ body *{visibility:visible !important;} #sheet,#sheet *{visibility:visible !important;} }
</style></head><body><div id="sheet"><div class="quote">${inner}</div></div></body></html>`;
  writeFileSync(join(OUT, code + ".html"), out, "utf8");
  const totalChs = [...doc.querySelectorAll("#items .ch")].length;
  return totalChs;
}

const nC = render(jobC, "quote-FULL-C");
console.log("สร้าง quote-FULL-C (" + nC + " รายการ/บาน) สำเร็จ");

// ===== verify: strip HTML แล้วตรวจ NaN + ออปชันโผล่ =====
const htmlOut = readFileSync(join(OUT, "quote-FULL-C.html"), "utf8");
const text = htmlOut.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

// NaN check
const nanMatches = (text.match(/\bNaN\b/g) || []).length;
console.log("\n--- verify ---");
console.log("NaN ในใบ:", nanMatches === 0 ? "ไม่มี (OK)" : "พบ " + nanMatches + " จุด (ERROR)");

// ราคารวมทั้งใบ — หา pattern "รวมทั้งหมด" หรือ "ยอดรวม" แล้วอ่านตัวเลขถัดไป
const totalMatch = text.match(/(?:รวมทั้งหมด|ยอดรวมสุทธิ|ยอดสุทธิ)\s*[\s:]*([0-9,]+)/);
if (totalMatch) {
  const totalStr = totalMatch[1].replace(/,/g, "");
  const total = parseInt(totalStr, 10);
  console.log("ราคารวมสุทธิ:", totalStr, total > 0 ? "(OK > 0)" : "(ERROR ≤ 0)");
} else {
  console.log("ราคารวม: หาไม่พบ pattern (อาจ OK ถ้าใบไม่มียอดรวม)");
}

// ตรวจว่าออปชันผสมโผล่ในใบ
const checks = [
  ["คาดตาราง", "o-gridmark / grid"],
  ["ธรณีหลังเต่า", "o-thresh turtle"],
  ["เสริมคาน", "o-beam folding"],
  ["ลูกฟูก", "rn89/rn90"],
  ["คอมโพสิต", "rn91/rn92"],
  ["ประตูรั้ว", "fence_gate"],
  ["หลังคา", "roof"],
  ["แปคู่", "roof batten"],
  ["ปิดปลาย", "roof end"],
  ["รางน้ำ", "roof gutter"],
  ["โซ่", "chain"],
  ["มุ้ง", "imp2x screen"],
  ["ม่านซิป", "zipscreen"],
  ["ระแนง", "ranae"],
  ["กั้นห้องกระจก", "GH set"],
  ["shower", "shower"],
  ["บานเปลือย", "frameless"],
  ["PC Door", "pc_door"],
];
const missing = [];
for (const [kw, label] of checks) {
  if (!text.includes(kw)) missing.push(label + " ['" + kw + "']");
}
if (missing.length === 0) {
  console.log("keyword ทุกตัวโผล่ในใบ (OK)");
} else {
  console.log("keyword ที่ไม่โผล่:", missing.join(", "));
}

process.exit(0);
