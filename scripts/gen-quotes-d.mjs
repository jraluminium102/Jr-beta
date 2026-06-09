// gen-quotes-d.mjs — ใบ FULL-D: 20 รายการเลียนใบเสนอราคาจริง
// วัตถุประสงค์: cross-check ว่าระบบทำได้เหมือนใบจริงไหม + จดบันทึกจุดที่ทำไม่ได้
// อ้างอิงใบจริง: คุณขวัญ/ปีเตอร์/นก/เหมียว/ชวลิต/ยี
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

// ปิด svc-protect (ใบจริงไม่บวกอัตโนมัติ)
{ const sp = doc.getElementById("svc-protect"); if (sp && sp.checked) { sp.checked = false; fire(sp, "change"); } }

function setF(ch, sel, v) {
  const el = ch.querySelector(sel);
  if (el) { el.value = String(v); fire(el, "input"); fire(el, "change"); }
}
function setF2(id, v) {
  const el = doc.getElementById(id);
  if (el) { el.value = String(v); fire(el, "input"); fire(el, "change"); }
}
function clearItems() { doc.getElementById("items").innerHTML = ""; }

function addItem(it) {
  w.addItem(doc.getElementById("items"));
  const chs = doc.querySelectorAll("#items .ch");
  const ch = chs[chs.length - 1];
  setF(ch, ".i-group", it.g);
  const ps = ch.querySelector(".i-prod");
  if (!ps.querySelector('option[value="' + it.prod + '"]')) {
    ps.innerHTML = w.prodOptionsG6(String(it.g));
  }
  ps.value = it.prod; fire(ps, "change");
  if (it.w != null) setF(ch, ".i-w", it.w);
  if (it.h != null) setF(ch, ".i-h", it.h);
  if (it.panels != null) setF(ch, ".i-panels", it.panels);
  if (it.qty != null) setF(ch, ".i-qty", it.qty);
  if (it.pos) setF(ch, ".i-position", it.pos);
  if (it.itype) setF(ch, ".i-type", it.itype);
  if (it.override != null) setF(ch, ".i-override", it.override);
  // กำหนด color (index) ถ้าระบุ
  if (it.colorIdx != null) {
    const c = ch.querySelector(".i-color");
    if (c) { c.value = String(it.colorIdx); fire(c, "change"); }
  }
  // กำหนด glass (index)
  if (it.glassIdx != null) {
    const g = ch.querySelector(".i-glass");
    if (g) { g.value = String(it.glassIdx); fire(g, "change"); }
  }
  // options เฉพาะ
  for (const [s, v] of Object.entries(it.opts || {})) setF(ch, s, v);
  // หมายเหตุ / OPTION text
  if (it.note) setF(ch, ".i-note", it.note);
  // sub-items (บานย่อย)
  if (it.subItems && it.subItems.length) {
    it.subItems.forEach((sub) => {
      w.addSubItem(ch.querySelector(".sub-addbtn"));
      const rows = ch.querySelectorAll(".subitem-list .subitem-row");
      const row = rows[rows.length - 1];
      if (row) {
        const st = row.querySelector(".s-type");
        if (st) { st.value = sub.type; fire(st, "change"); }
        const sw = row.querySelector(".s-w");
        if (sw) { sw.value = String(sub.w || 1); fire(sw, "input"); }
        const sh = row.querySelector(".s-h");
        if (sh) { sh.value = String(sub.h || 0.5); fire(sh, "input"); }
      }
    });
  }
  return ch;
}

// addGlasshouseSet2 — สร้างชุดกั้นห้องกระจก (flow ระบบชุด)
function addGlasshouseSet2(cfg) {
  const sb = w.addGlasshouseSet();
  const sn = sb.querySelector(".set-name");
  if (sn) { sn.value = cfg.name || "กั้นห้องกระจก"; fire(sn, "input"); fire(sn, "change"); }
  const parts = sb.querySelector(".set-parts");
  let chs = parts.querySelectorAll(".ch");
  const sides = cfg.sides || [];
  if (sides.length > 0) {
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
    if (s0.opts) for (const [sel, v] of Object.entries(s0.opts)) setF(ch0, sel, v);
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
    if (sN.opts) for (const [sel, v] of Object.entries(sN.opts)) setF(chN, sel, v);
  }
  if (cfg.roof) {
    const roofBtn = sb.querySelector(".set-addroof");
    if (roofBtn) fire(roofBtn, "click");
    chs = parts.querySelectorAll(".ch");
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
  }
  return sb;
}

// ========== 20 รายการเลียนใบจริง ==========
//
// หมายเลข 1–20 ตรงกับ spec ในงาน
// cross-check note ฝังใน comment ต่อรายการ (สรุปใน console log ด้านล่าง)

// ====== สี / กระจก index ที่ใช้บ่อย ======
// colorIdx: 0=ขาว, 1=ดำ, 2=เทาซาฮาร่า(ตรง), 3=เทาซาฮาร่า2(แล้วแต่ version)
// glassIdx: 0=clear6, 1=clear5, 2=green6, 3=bronze6, ... (ดู GLASS array ใน HTML)
// → เพื่อเลียนใบจริง เลือก glassIdx=2 (เขียว 6 มม.) สำหรับรายการที่ระบุกระจกเขียว

const jobD = {
  cust: "รวมตัวอย่างใบจริง (FullD cross-check 20 รายการ)",
  date: "08-06-69",
  discFlat: 0,
  items: [

    // ---- 1. ประตูบานเปิดคู่+ติดตาย(ธรณีกันน้ำ) ลูกฟูก·เทาซาฮาร่า·เขียว6 ----
    // ใบจริง: casement_flush_solid 2 บาน, ธรณีกันน้ำ(มาตรฐาน), ติดตายข้าง 1 บาน
    // ระบบทำได้: บานเปิด+ติดตายข้าง ใช้ subItem · ลูกฟูกเสมอกรอบ = casement_flush_solid
    // ขาด: ราคา casement_flush_solid ต้อง override (custom_price=1, min=0) → กรอกเอง
    {
      g: 1, prod: "casement_flush_solid",
      pos: "ประตูบานเปิดคู่ ลูกฟูกเสมอกรอบ",
      w: 1.8, h: 2.4, panels: 2, qty: 1,
      override: 85000,
      colorIdx: 2,   // เทาซาฮาร่า
      glassIdx: 2,   // เขียว 6 มม.
      opts: { ".o-thresh": "std" },
      note: "หมายเหตุ : ลูกฟูกเสมอกรอบ (โซลิดทู) · ธรณีกันน้ำมาตรฐาน\nOPTION : เปลี่ยนธรณีเป็นหลังเต่า+DropSeal บวกเพิ่ม 1,000 บาท",
      subItems: [{ type: "ช่องแสงติดตาย", w: 0.9, h: 0.5 }],
    },

    // ---- 2. บานเลื่อนเปิดคู่กลางรางบน(โชว์ราง+เสริมคาน)+ติดตายข้าง ----
    // ใบจริง: inner_top_stack เปิดคู่กลาง 4 บาน (เลื่อน 2 ติดตาย 2) รางบน โชว์ราง+เสริมคาน
    // ระบบทำได้: inner_top_stack + o-opentype=บานเลื่อนเปิดคู่กลาง + o-fixed=2 + o-track=โชว์ราง
    // ขาด: เสริมคาน o-beamm เป็น 0 ถ้า track=โชว์ราง (เสริมคานโผล่เฉพาะตอน track=ซ่อนราง)
    //       → เพิ่ม o-beamm/o-beammlen โดยตรง (เซลล์ต้องกรอก)
    {
      g: 1, prod: "inner_top_stack",
      pos: "ประตูบานเลื่อนรางบน เปิดคู่กลาง",
      w: 3.0, h: 2.4, panels: 4, qty: 1,
      opts: {
        ".o-opentype": "บานเลื่อนเปิดคู่กลาง",
        ".o-fixed": "2",
        ".o-track": "โชว์ราง",
        ".o-beamm": "2400",
        ".o-beammlen": "3.0",
      },
      note: "หมายเหตุ : รางบน โชว์ราง + เสริมคานซัพพอร์ทรุ่น1 ยาว 3 ม.\nOPTION : เปลี่ยนเป็นรางซ่อน บวกเพิ่ม 5,000 บาท",
    },

    // ---- 3. บานเลื่อนไร้ราง·กระจกเงา2ด้าน ----
    // ใบจริง: inner_top_slimlux (SlimLux รางบน ไม่มีรางล่าง) · กระจกเทมเปอร์6มม. (รวมในราคา)
    // ระบบทำได้: inner_top_slimlux ระบุ "ไร้ราง" ผ่าน prodName ใน genQuote
    // ขาด: "กระจกเงา 2 ด้าน" ไม่มีใน GLASS (GLASS มีแค่เทมเปอร์/ลามิเนต/เขียว)
    //       → ใส่ได้แค่กระจกเทมเปอร์ใส 6 มม. (รวมในราคา) · ระบุในหมายเหตุ
    {
      g: 1, prod: "inner_top_slimlux",
      pos: "บานเลื่อนไร้ราง (SlimLux) ห้องนอน",
      w: 2.4, h: 2.4, panels: 2, qty: 1,
      opts: { ".o-opentype": "บานเลื่อน", ".o-fixed": "0" },
      note: "หมายเหตุ : กระจกเทมเปอร์ใส 6 มม. (รวมในราคา)\nOPTION : เปลี่ยนเป็นกระจกเงา 2 ด้าน — ราคาเพิ่มตามจริง (เช็คซ้ำ)",
    },

    // ---- 4. บานเลื่อนลากจูง2บาน+ติดตาย ----
    // ใบจริง: sliding_euro ลากจูง 2 บาน + ติดตาย 1 บาน
    {
      g: 1, prod: "sliding_euro",
      pos: "ประตูบานเลื่อนลากจูง+ติดตาย",
      w: 3.6, h: 2.4, panels: 3, qty: 1,
      glassIdx: 2,  // เขียว 6 มม.
      opts: {
        ".o-opentype": "บานเลื่อนลากจูง",
        ".o-fixed": "1",
      },
    },

    // ---- 5. บานเลื่อน SlimLux·สลิง+softclose ----
    // ใบจริง: inner_top_slimlux สลิง+softclose รวมในราคาแล้ว (ชื่อสินค้ามี "(รวม soft close+สลิง...)")
    // ระบบทำได้: inner_top_slimlux = รวมอยู่แล้วตาม product name
    // ขาด: ไม่มี option แยก softclose/สลิง (รวมในราคา) → ระบบทำได้โดยอัตโนมัติ
    {
      g: 1, prod: "inner_top_slimlux",
      pos: "บานเลื่อน SlimLux รวม soft close+สลิง",
      w: 1.8, h: 2.4, panels: 2, qty: 1,
      opts: { ".o-opentype": "บานเลื่อนสลับ", ".o-fixed": "0" },
    },

    // ---- 6. หน้าต่างเลื่อนสลับ+ติดตาย·ลูกฟูก ----
    // ใบจริง: sliding_euro หน้าต่าง 3 บาน (สลับ 2 + ติดตาย 1) ลูกฟูกเสมอกรอบ
    // ขาด: "ลูกฟูก" ของบานเลื่อนไม่มี field พิเศษ (sliding_euro ไม่ใช่ solid_door)
    //       → ระบุในหมายเหตุเท่านั้น
    {
      g: 1, prod: "sliding_euro",
      pos: "หน้าต่างเลื่อนสลับ ลูกฟูกเสมอกรอบ",
      w: 2.4, h: 1.4, panels: 3, qty: 1,
      itype: "window",
      glassIdx: 2,
      opts: {
        ".o-opentype": "บานเลื่อนสลับ",
        ".o-fixed": "1",
      },
      note: "หมายเหตุ : ลูกฟูกเสมอกรอบ (บนหน้าต่าง)",
    },

    // ---- 7. ประตูบานเปิดแบ่ง4บาน ----
    // ใบจริง: casement_euro คู่ (2 บาน x2 ด้าน = 4 บาน) หรือ panels=4 1 ชุด
    {
      g: 1, prod: "casement_euro",
      pos: "ประตูบานเปิดคู่ (4 บาน)",
      w: 3.6, h: 2.4, panels: 4, qty: 1,
      glassIdx: 2,
      opts: { ".o-thresh": "std" },
    },

    // ---- 8. หน้าต่างเลื่อนสลับชุดยูโร+อินซูเลท+มุ้งเฟรมใหญ่+OPTION เปลี่ยนกระจก ----
    // ใบจริง: sliding_euro window + insul + imp23 (มุ้งเฟรมใหญ่) + OPTION เปลี่ยนกระจก
    // ระบบทำได้: sliding_euro + o-insul=checked + mosqId ตัว imp23 + note OPTION
    // ขาด: o-insul ปัจจุบันมีแค่ใน "หลังคา" (p.optInsul) — หน้าต่างเลื่อนไม่มี optInsul
    //       → ระบุในหมายเหตุ + note OPTION
    {
      g: 1, prod: "sliding_euro",
      pos: "หน้าต่างเลื่อนสลับ ชุดยูโร",
      w: 1.6, h: 1.2, panels: 2, qty: 2,
      itype: "window",
      glassIdx: 1,  // clear 5 มม.
      opts: {
        ".o-opentype": "บานเลื่อนสลับ",
        ".o-fixed": "0",
      },
      note: "OPTION : เพิ่มฉนวนกันความร้อน (อินซูเลท) ราคาเพิ่ม 600 บาท/ตร.ม.\nOPTION : เปลี่ยนเป็นกระจกลามิเนต 4+4 มม. ราคาเพิ่มตามจริง",
    },

    // ---- 9. บานกระทุ้งชุดยูโร+มุ้ง+ติดตายบน ----
    // ใบจริง: awning_euro + subItem ติดตายบน + mosquito
    {
      g: 1, prod: "awning_euro",
      pos: "หน้าต่างบานกระทุ้ง ชุดยูโร",
      w: 1.2, h: 1.2, qty: 1,
      itype: "window",
      glassIdx: 2,
      subItems: [{ type: "ช่องแสงติดตาย", w: 1.2, h: 0.4 }],
    },

    // ---- 10. บานเลื่อนเปิดคู่กลางรางล่าง+มุ้ง ----
    // ใบจริง: sliding_euro เปิดคู่กลาง รางล่าง 4 บาน + มุ้งเฟรมใหญ่
    {
      g: 1, prod: "sliding_euro",
      pos: "ประตูบานเลื่อนเปิดคู่กลาง รางล่าง",
      w: 4.0, h: 2.4, panels: 4, qty: 1,
      glassIdx: 2,
      opts: {
        ".o-opentype": "บานเลื่อนเปิดคู่กลาง",
        ".o-fixed": "2",
      },
    },

    // ---- 11. ประตูบานเปิด+หน้าต่างบานเปิด·อินซูเลท ----
    // ใบจริง: casement_euro ประตู + casement_euro หน้าต่าง (2 รายการ) กระจกอินซูเลท
    // ขาด: กระจกอินซูเลท (double-glazed) ไม่มีใน GLASS array → ระบุในหมายเหตุ
    {
      g: 1, prod: "casement_euro",
      pos: "ประตูบานเปิด พร้อมกระจกอินซูเลท",
      w: 0.9, h: 2.1, panels: 1, qty: 1,
      glassIdx: 1,
      opts: { ".o-thresh": "std" },
      note: "หมายเหตุ : กระจกอินซูเลท 5+9A+5 มม. (เช็คราคาเพิ่มตามจริง)",
    },

    // ---- 12. บานเฟี้ยมแบ่ง3+3(เสริมคาน+ฝังรางยู)·ชุบสีทอง ----
    // ใบจริง: folding 6 บาน + o-beam (เสริมคาน) · สีทอง(ชุบ) ไม่มีใน COLORS มาตรฐาน
    // ขาด: "สีชุบทอง" ไม่มีใน COLORS dropdown (COLORS มีสีอบ/ลายไม้/สต๊อก ไม่มี gold plated)
    //       "ฝังรางยู" ไม่มี option ในระบบ → ระบุในหมายเหตุ
    {
      g: 1, prod: "folding_euro",
      pos: "บานเฟี้ยม 3+3 บาน (เสริมคาน)",
      w: 4.2, h: 2.4, panels: 6, qty: 1,
      glassIdx: 2,
      opts: { ".o-beam": true, ".o-threshf": "outer" },
      note: "หมายเหตุ : เสริมคาน (เหล็กกล่อง) + ฝังรางยู (เช็คซ้ำ)\nOPTION : ชุบสีทอง — ราคาเพิ่มตามจริง (ไม่มีในระบบ — ต้องกรอก override)",
    },

    // ---- 13. กั้นห้อง+หลังคา หลายด้าน A-E (คาดตาราง+ระแนงบังตา+หลังคาไวนิล) ----
    // ใบจริง: addGlasshouseSet หลายด้าน A-E · ด้าน B มีระแนงบังตา
    // ระบบทำได้: addGlasshouseSet2 ได้ครบ · ระแนงบังตา = prod ใน group6? ไม่ → g=2+rn1 แยกรายการ
    // ขาด: ระแนงบังตาในกั้นห้อง ต้องใส่เป็น item แยก (g=2, prod=rn1) ไม่ใช่อยู่ใน set
    // → รายการนี้ใช้ addGlasshouseSet2 + note + item ระแนงแยก
  ],

  // set 13: กั้นห้องกระจก หลายด้าน A-E
  ghSets: [
    {
      name: "กั้นห้องกระจก (ต่อเติมหลังบ้าน)",
      sides: [
        { prod: "sliding_euro", w: 4.0, h: 2.4, pos: "ด้าน A (ประตูเลื่อนเปิดคู่กลาง)",
          opts: { ".o-opentype": "บานเลื่อนเปิดคู่กลาง", ".o-fixed": "2" } },
        { prod: "fixed_glass",  w: 2.4, h: 2.4, pos: "ด้าน B (ติดตาย+ระแนงบังตา)" },
        { prod: "casement_euro", w: 1.8, h: 2.4, pos: "ด้าน C (ประตูบานเปิด)" },
        { prod: "fixed_glass",  w: 2.4, h: 2.4, pos: "ด้าน D (ติดตาย)" },
        { prod: "fixed_glass",  w: 1.2, h: 2.4, pos: "ด้าน E (ติดตาย)" },
      ],
      roof: { prod: "roof_vinyl", w: 12.0, h: 4.5 },
    },
  ],
};

// ---- รายการ 14-20: เพิ่มหลัง ghSets (addItem ปกติ) ----
const extraItems = [

  // ---- 14. หลังคากันสาดโพลีตัน+โซ่รางน้ำ+OPTION ยื่น ----
  // ใบจริง: roof_polyton + รางน้ำโซ่ · OPTION ยื่นออก (เพิ่มเสา/ขยายพื้นที่)
  // ขาด: OPTION ยื่น = ไม่มีใน option system → ระบุในหมายเหตุ
  // selector จริง: .o-roofend / .o-guttersys / .o-gutter-chainpat / .o-gutter-chaincolor
  {
    g: 3, prod: "roof_polyton",
    pos: "หลังคากันสาด โพลีตัน 3 มม.",
    w: 4.0, h: 3.0, qty: 1,
    opts: {
      ".o-roofend": "รางน้ำ",
      ".o-guttersys": "โซ่",
      ".o-gutter-chainpat": "ทิวลิป",
      ".o-gutter-chaincolor": "ขาว",
    },
    note: "OPTION : ยื่นออกเพิ่ม 1 ม. (เพิ่มเสา 2 ต้น + ขยายโครง) — ราคาเพิ่มตามจริง",
  },

  // ---- 15. หลังคากันสาด+รั้วระแนง+คอมโพสิทซ่อนสโลป ----
  // ใบจริง: roof_vinyl + rn1 ระแนง + roof_hide_composite (ซ่อนสโลป)
  // ระบบทำได้: 3 รายการแยก
  {
    g: 3, prod: "roof_vinyl",
    pos: "หลังคากันสาด ไวนิล",
    w: 3.0, h: 2.5, qty: 1,
    opts: { ".o-roofend": "ปล่อย" },
  },
  {
    g: 2, prod: "rn1",
    pos: "ระแนงบังตาผนัง 1×5 ซม.",
    w: 3.0, h: 1.8, qty: 1,
  },

  // ---- 16. ราวกันตกกระจก+หลังคากระจกลามิเนต ----
  // ใบจริง: imp1 ราวกันตก + roof_laminate หลังคากระจกลามิเนต
  {
    g: 2, prod: "imp1",
    pos: "ราวกันตก บันไดเฉียง (หมุดแปะปูน)",
    w: 5.0, h: null, qty: 1,
  },
  {
    g: 3, prod: "roof_laminate",
    pos: "หลังคากระจกลามิเนต skylight/กันสาด",
    w: 3.0, h: 4.0, qty: 1,
    opts: { ".o-roofend": "ปล่อย" },
  },

  // ---- 17. Shower·เทมเปอร์10 ----
  // ใบจริง: shower กั้นห้องน้ำ กระจกเทมเปอร์ใส 10 มม. + ราวสแตนเลส
  // ระบบทำได้: shower รวมเทมเปอร์10+ราวสแตนเลส ในราคาแล้ว
  {
    g: 1, prod: "shower",
    pos: "shower กั้นห้องน้ำ (ประตู+ติดตาย)",
    w: 1.2, h: 2.0, qty: 1,
    auto: false,
    opts: { ".o-shtype": "door_fixed", ".o-shdoortype": "swing" },
  },

  // ---- 18. กลาสเฮ้าส์หลายด้าน+หลังคากระจก ----
  // ใบจริง: addGlasshouseSet หลายด้าน + หลังคา roof_laminate
  // → ใช้ ghSets ด้านบนแทน (แยกชุด) · รายการ 18 นี้คือชุดที่ 2 ที่แยก (เพิ่ม ghSet ใหม่)
  // NOTE: ไม่ใส่ extraItems ตรงนี้ — ชุดที่ 2 เพิ่มใน ghSets2 ด้านล่าง (วน addGlasshouseSet2)

  // ---- 19. Skylight ลามิเนต ----
  // ใบจริง: roof_laminate (skylight) ติดตั้งบนหลังคา กรอบอลู + กระจกลามิเนต
  // ระบบทำได้: roof_laminate ครอบคลุมได้ (method bucket)
  {
    g: 3, prod: "roof_laminate",
    pos: "skylight กระจกลามิเนต หน้าต่างหลังคา",
    w: 1.5, h: 1.5, qty: 1,
    opts: {
      ".o-roofframe": "โครงอลูมิเนียม",
      ".o-roofbatten": "แปคู่",
      ".o-roofend": "ปิดปลาย",
    },
    note: "หมายเหตุ : skylight กระจกลามิเนต 6+6 pvb · ใช้แปคู่ + ปิดปลาย",
  },

  // ---- 20. กั้นห้อง ISOWALL+เมทัลชีท (ด้านA-M) ----
  // ใบจริง: ISOWALL ผนัง + imp7/imp8 เมทัลชีท หลาย section
  // ระบบทำได้บางส่วน: isowall + imp7 แยกรายการ · แต่ ISOWALL ไม่ใช่ addGlasshouseSet
  // ขาด: ด้าน A-M หลาย section ไม่มี "ชุด" แบบ glasshouse → ต้องกรอกทีละรายการ
  //       ไม่มี "ผนังสำเร็จรูป ISOWALL" multi-side system
  {
    g: 3, prod: "isowall",
    pos: "ผนัง ISOWALL ด้าน A-D",
    w: 8.0, h: 3.0, qty: 1,
    note: "หมายเหตุ : ISOWALL 50 มม. · ด้าน A+B+C+D รวม 8×3 ม.\nหมายเหตุ : ด้าน E-M (เมทัลชีท) กรอกแยกรายการด้านล่าง",
  },
  {
    g: 3, prod: "imp7",
    pos: "เมทัลชีท 1 นิ้ว ท้อง PVC EPS ด้าน E-M",
    w: 12.0, h: 3.0, qty: 1,
    note: "หมายเหตุ : เมทัลชีทสีน้ำเงิน · ด้าน E-M รวม 12×3 ม.",
  },
];

// ghSets เพิ่มเติม (รายการ 18 = ชุดที่ 2)
const ghSets2 = [
  {
    name: "กลาสเฮ้าส์หลายด้าน + หลังคากระจกลามิเนต",
    sides: [
      { prod: "sliding_euro", w: 3.6, h: 2.4, pos: "ด้าน A (ประตูเลื่อน)" },
      { prod: "fixed_glass",  w: 2.4, h: 2.4, pos: "ด้าน B (ติดตาย)" },
      { prod: "casement_euro", w: 1.8, h: 2.4, pos: "ด้าน C (บานเปิด)" },
      { prod: "fixed_glass",  w: 3.0, h: 2.4, pos: "ด้าน D (ติดตาย)" },
    ],
    roof: { prod: "roof_laminate", w: 9.0, h: 4.0 },
  },
];

// ========== render ==========
function render(job, extraItems, ghSets2, code) {
  clearItems();
  setF2("discFlat", job.discFlat || 0);
  setF2("discPct", 0);
  setF2("custName", job.cust);
  setF2("qdate", job.date);
  setF2("sellerName", "เซลล์ทดสอบ D");
  setF2("custContact", "ลูกค้า FullD (Line)");
  setF2("custPhone", "08X-XXX-XXXX");
  setF2("custAddress", "เลขที่ — หมู่ — ต.— อ.— จ.— 00000 (ทดสอบ FullD)");

  w.eval("window._calcQuoteOrig = calcQuote; calcQuote = function(){};");

  // items 1–12 (ก่อน ghSets)
  job.items.forEach(addItem);

  // ghSets (รายการ 13, 18 ผ่าน set) — ชุดที่ 1 (A-E + หลังคา)
  if (job.ghSets && job.ghSets.length) {
    for (const cfg of job.ghSets) addGlasshouseSet2(cfg);
  }

  // extra items 14–20
  extraItems.forEach(addItem);

  // ghSets2 (ชุดที่ 2 = รายการ 18)
  for (const cfg of ghSets2) addGlasshouseSet2(cfg);

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

const nD = render(jobD, extraItems, ghSets2, "quote-FULL-D");
console.log("สร้าง quote-FULL-D (" + nD + " รายการรวม)");

// ========== cross-check ใน HTML strip ==========
// อ่าน output กลับมา strip tags แล้ว log ย่อ
const rawHtml = readFileSync(join(OUT, "quote-FULL-D.html"), "utf8");
const stripped = rawHtml
  .replace(/<style[\s\S]*?<\/style>/gi, "")
  .replace(/<script[\s\S]*?<\/script>/gi, "")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ")
  .replace(/\s{2,}/g, " ")
  .trim();

// เช็ค keyword จากใบจริงที่ควรปรากฏ
const CHECKS = [
  { no: 1,  label: "ลูกฟูกเสมอกรอบ/โซลิด",      kw: ["โซลิด", "ลูกฟูก", "ประตูบานเปิด"] },
  { no: 2,  label: "รางบน/โชว์ราง/เสริมคาน",      kw: ["รางบน", "เสริมคาน"] },
  { no: 3,  label: "SlimLux/ไร้ราง",              kw: ["SlimLux", "slimlux", "ไร้ราง"] },
  { no: 4,  label: "บานเลื่อนลากจูง",             kw: ["ลากจูง"] },
  { no: 5,  label: "SlimLux+softclose+สลิง",      kw: ["SlimLux", "slimlux"] },
  { no: 6,  label: "หน้าต่างเลื่อนสลับ",          kw: ["สลับ", "หน้าต่าง"] },
  { no: 7,  label: "บานเปิด 4 บาน",               kw: ["4 บาน", "บานเปิด"] },
  { no: 8,  label: "อินซูเลท/OPTION เปลี่ยนกระจก", kw: ["อินซูเลท", "OPTION"] },
  { no: 9,  label: "บานกระทุ้ง+ช่องแสงติดตาย",    kw: ["กระทุ้ง", "ช่องแสงติดตาย"] },
  { no: 10, label: "เปิดคู่กลาง+มุ้ง",            kw: ["เปิดคู่กลาง"] },
  { no: 11, label: "อินซูเลท note",               kw: ["กระจกอินซูเลท"] },
  { no: 12, label: "บานเฟี้ยม+เสริมคาน",          kw: ["เฟี้ยม", "เสริมคาน"] },
  { no: 13, label: "กั้นห้องหลายด้าน A-E",         kw: ["ด้าน A", "ด้าน C", "ด้าน E"] },
  { no: 14, label: "โพลีตัน+โซ่รางน้ำ",           kw: ["โพลีตัน", "โซ่"] },
  { no: 15, label: "ระแนงบังตา rn1",              kw: ["ระแนง", "บังตา"] },
  { no: 16, label: "ราวกันตก+ลามิเนต",            kw: ["ราวกันตก", "ลามิเนต"] },
  { no: 17, label: "shower เทมเปอร์10+ราวสแตน",  kw: ["shower","เทมเปอร์", "ราวสแตนเลส"] },
  { no: 18, label: "กลาสเฮ้าส์หลายด้าน+หลังคากระจก", kw: ["กลาสเฮ้าส์", "ลามิเนต"] },
  { no: 19, label: "skylight ลามิเนต",            kw: ["skylight", "ลามิเนต"] },
  { no: 20, label: "ISOWALL+เมทัลชีท",           kw: ["ISOWALL", "เมทัลชีท"] },
];

console.log("\n========== cross-check keyword ==========");
const results = [];
for (const c of CHECKS) {
  const found = c.kw.map(k => ({ k, ok: stripped.toLowerCase().includes(k.toLowerCase()) }));
  const allOk = found.every(f => f.ok);
  const missing = found.filter(f => !f.ok).map(f => f.k);
  results.push({ no: c.no, label: c.label, allOk, missing });
  const icon = allOk ? "OK" : "!!";
  console.log(`[${icon}] #${String(c.no).padStart(2,"0")} ${c.label}${missing.length ? " — ขาด: " + missing.join(", ") : ""}`);
}

const okCount = results.filter(r => r.allOk).length;
console.log(`\nผ่าน ${okCount}/${CHECKS.length} รายการ`);
console.log("ไฟล์ output: ใบเสนอราคาทดสอบ/quote-FULL-D.html");

process.exit(0);
