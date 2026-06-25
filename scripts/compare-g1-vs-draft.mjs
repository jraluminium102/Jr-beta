/**
 * compare-g1-vs-draft.mjs  v2
 * ตรวจ index.html (เว็บสด) vs ดราฟเกณฑ์ DRAFT-G1-GROUNDTRUTH-ปุ่มทุกปุ่ม-2026-06-22.html
 * ใช้ข้อมูล probe จริงทุก prod (jsdom) เทียบกับสเปกดราฟแบบ class-exact
 * OUTPUT: docs/COMPARE-G1-เว็บสด-vs-ดราฟ-2026-06-23.html
 */
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const INDEX_PATH = join(ROOT, "public", "calculator", "index.html");
const OUT_PATH = join(ROOT, "docs", "COMPARE-G1-เว็บสด-vs-ดราฟ-2026-06-23.html");

// ==============================
// Boot jsdom
// ==============================
const html = readFileSync(INDEX_PATH, "utf8");
const vc = new VirtualConsole();
vc.on("jsdomError", () => {});
const dom = new JSDOM(html, {
  runScripts: "dangerously",
  pretendToBeVisual: true,
  virtualConsole: vc,
  url: "http://localhost/calculator/index.html",
});
await new Promise(r => {
  if (dom.window.document.readyState === "complete") r();
  else dom.window.addEventListener("load", r);
  setTimeout(r, 3000);
});
const w = dom.window;
const doc = w.document;
const fire = (el, t) => el.dispatchEvent(new w.Event(t, { bubbles: true }));

// probe สินค้า 1 ตัว → คืน object ค่าจริงทุก control
function probe(prodId) {
  doc.getElementById("items").innerHTML = "";
  try { w.addItem(doc.getElementById("items")); } catch (e) { return null; }
  const ch = doc.querySelector("#items .ch");
  if (!ch) return null;
  const gs = ch.querySelector(".i-group");
  if (gs) { gs.value = "1"; fire(gs, "change"); }
  const ps = ch.querySelector(".i-prod");
  if (!ps) return null;
  if (!ps.querySelector(`option[value="${prodId}"]`)) return null;
  ps.value = prodId;
  fire(ps, "change");
  const wi = ch.querySelector(".i-w"), hi = ch.querySelector(".i-h");
  if (wi) { wi.value = "1.5"; fire(wi, "input"); fire(wi, "change"); }
  if (hi) { hi.value = "2.2"; fire(hi, "input"); fire(hi, "change"); }

  const g = name => !!ch.querySelector(name);
  const chipOn = cls => { const c = ch.querySelector(`[data-val][onclick*="${cls}"].on`); return c ? c.dataset.val : null; };

  return {
    // ชิปลักษณะเปิด
    o_opentype: g(".o-opentype"), def_opentype: chipOn("o-opentype"),
    // ราง
    o_bottomrail: g(".o-bottomrail"), def_bottomrail: chipOn("o-bottomrail"),
    o_track: g(".o-track"), def_track: chipOn("o-track"),
    // ล็อค
    o_slidelock: g(".o-slidelock"), def_slidelock: chipOn("o-slidelock"),
    o_lock: g(".o-lock"), def_lock: chipOn("o-lock"),
    // ปุ่มประเภท (i-type)
    i_type: g(".i-type"), def_itype: chipOn(`"i-type"`),
    // ธรณี
    o_thresh: g(".o-thresh"), def_thresh: chipOn("o-thresh"),
    o_threshf: g(".o-threshf"), def_threshf: chipOn("o-threshf"),
    // เฟี้ยม ทิศเปิด
    o_folddir: g(".o-folddir"), def_folddir: chipOn("o-folddir"),
    // โช้คอัพ
    o_closer: g(".o-closer"),
    // ล็อค-ชุด controls
    o_gridmark: g(".o-gridmark"),
    o_mosq: g(".o-mosq"),
    o_fcsides: g(".o-fcsides"),
    o_dfm: g(".o-dfm"),
    o_removeold: g(".o-removeold"),       // "รื้อ" class จริงในเว็บ
    o_solidlight: g(".o-solidlight"),     // ช่องแสงบานทึบ
    o_solidlower: g(".o-solidlower"),     // แผ่นทึบล่าง (เว็บมี ดราฟไม่ได้ตัดสมบูรณ์)
    o_motor: g(".o-motor"), def_motor: chipOn("o-motor"),
    o_liftmode: g(".o-liftmode"), def_liftmode: chipOn("o-liftmode"),
    o_shtype: g(".o-shtype"), def_shtype: chipOn("o-shtype"),
    o_shdoortype: g(".o-shdoortype"), def_shdoortype: chipOn("o-shdoortype"),
    o_awnbrace: g(".o-awnbrace"),
    o_fullgrid: g(".o-fullgrid"),
    o_combo: g(".o-combo_awn_inside"),
    o_softclose: g(".o-softclose"),
    o_sling: g(".o-sling"),
    o_beamhide: g(".o-beamhide"),
    o_railhide: g(".o-railhide"),
    o_railyu: g(".o-railyu"),
    o_beamsupp: g(".o-beamsupp"),
    o_wallframe: g(".o-wallframe"),
    o_shcolor: g(".o-shcolor"),
    o_shcorner: g(".o-shcorner"),
    o_framecolor: g(".o-framecolor"),
    i_color: g(".i-color"),
    note_opt: g(".note-opt-group"),
    subitem_shown: (() => { const sw = ch.querySelector(".subitem-wrap"); return sw && sw.style.display !== "none"; })(),
    handle_brands: [...(ch.querySelector(".handle-brand-wrap") ? ch.querySelectorAll("[data-hbrand]") : [])].map(b => b.dataset.hbrand),
    frameless_chips: [...ch.querySelectorAll("[onclick*='framelessTypeSwitch']")].map(b => b.textContent.trim()),
    def_frameless: (() => { const c = ch.querySelector("[onclick*='framelessTypeSwitch'].on"); return c ? c.textContent.trim() : null; })(),
    // aw_mode (บานกระทุ้ง) ดูผ่าน p.opts → โผล่เป็น checkbox/select ที่มี "tilt"
    has_tilt_turn: (() => {
      const sel = Array.from(ch.querySelectorAll("select")).find(s => Array.from(s.options).some(o => /tilt/i.test(o.text)));
      return !!sel;
    })(),
    // มุ้ง options count
    mosq_opts: (() => { const el = ch.querySelector(".o-mosq"); return el && el.tagName === "SELECT" ? el.options.length : 0; })(),
    // สี options count
    color_opts: (() => { const el = ch.querySelector(".i-color"); return el && el.tagName === "SELECT" ? el.options.length : 0; })(),
    // สีเฟรม บานเปลือย
    framecolor_opts: (() => { const el = ch.querySelector(".o-framecolor"); return el && el.tagName === "SELECT" ? el.options.length : 0; })(),
  };
}

// ==============================
// สเปกดราฟ — เกณฑ์ที่ควรเป็น ต่อชนิด
// items: { key, live_field, draft_val, live_val_fn, note, zone }
// live_val_fn = ฟังก์ชันที่รับ probed object → คืนค่าจริง
// ==============================
function buildSpecs(probed) {
  const P = probed; // short alias

  // helper: เทียบ true/false
  const bool = (key, draftExpect, desc, note = "") => ({
    key, draft: draftExpect ? "มี" : "ไม่มี", live: P[key] ? "มี" : "ไม่มี",
    status: (P[key] ? true : false) === draftExpect ? "OK" : (draftExpect ? "MISS" : "EXTRA"),
    note,
  });
  const defCheck = (key, draftDef, liveVal, note = "") => ({
    key: `${key} default`,
    draft: draftDef || "(ไม่กำหนด)",
    live: liveVal !== null && liveVal !== undefined ? liveVal : "(null)",
    status: !draftDef ? "INFO" : (liveVal === draftDef ? "OK" : "DIFF"),
    note,
  });

  return {
    // ===== 1. บานเลื่อน =====
    slide: {
      name: "บานเลื่อน", prodId: "sliding_sms",
      draftControls: [
        // z1
        { key: "รุ่น (เซมิยูโร/ยูโร/E-series)", note: "ดราฟ: 3 รุ่น ผ่านปุ่มกลุ่ม", status: "INFO", draft: "3 รุ่น", live: "prod: sliding_sms/sliding_euro/sliding_eseries (เลือกได้ใน G1)" },
        bool("o_opentype", true, "ชนิดการเปิด (chip)"),
        defCheck("ชนิดการเปิด", "บานเลื่อน", P.def_opentype, "เว็บใช้ value 'บานเลื่อน' = 'เลื่อน (ระบุติดตาย)' ตามดราฟ"),
        bool("o_bottomrail", true, "ราง (ล่าง)", "ดราฟ: รางกันน้ำ/รางเตี้ย 7มม."),
        defCheck("ราง default", "กันน้ำ", P.def_bottomrail, ""),
        bool("o_slidelock", true, "ชุดล็อค (เฉพาะประตู)", "ดราฟ: มีชุดล็อก + กุญแจ เป็น default"),
        defCheck("ชุดล็อค default", "มีกุญแจ", P.def_slidelock, "เว็บ='มีกุญแจ' = ดราฟ 'มีชุดล็อก + กุญแจ' (ค่าเดียวกัน text ต่าง)"),
        { key: "มือจับ (brands ครบ: cmech/ดิจิตอล/สแตน/รุ่นอื่น)", draft: "มี 4 brands", live: P.handle_brands.join(",") || "ไม่มี handle-brand-wrap", status: P.handle_brands.includes("cmech") && P.handle_brands.includes("digital") && P.handle_brands.includes("stainless") && P.handle_brands.includes("other") ? "OK" : "MISS", note: "" },
        // z2
        bool("o_mosq", true, "มุ้ง (ดราฟ: 5 ปุ่ม)"),
        bool("o_gridmark", true, "คาดตาราง (checkbox)"),
        { key: "แผ่นทึบล่าง (ดราฟ: ลูกฟูก/คอมโพสิท)", draft: "มี", live: P.o_solidlower ? "มี (o-solidlower แสดงผล)" : "ไม่พบ o-solidlower", status: P.o_solidlower ? "OK" : "MISS", note: "ดราฟเรียก 'แผ่นทึบล่าง' เว็บใช้ class o-solidlower" },
        // z3
        bool("i_color", true, "สี/กระจก (L1-L3)"),
        bool("o_fcsides", true, "ครอบวงกบ"),
        bool("o_dfm", true, "ดรอปพื้น"),
        bool("o_removeold", true, "รื้อ", "เว็บใช้ class o-removeold ไม่ใช่ o-remove"),
        { key: "งานเสริม / หมายเหตุ", draft: "มี (note-opt-group)", live: P.note_opt ? "มี (.note-opt-group)" : "ไม่พบ", status: P.note_opt ? "OK" : "MISS", note: "" },
        { key: "ผสมบาน", draft: "มี (เฉพาะบานจริง)", live: P.subitem_shown ? "แสดง (subitem-wrap)" : "ซ่อน/ไม่มี", status: P.subitem_shown ? "OK" : "MISS", note: "" },
      ],
    },

    // ===== 2. เลื่อนภายใน =====
    inner: {
      name: "เลื่อนภายใน", prodId: "inner_top_stack",
      draftControls: [
        { key: "รุ่น (รางบนซ้อน/SlimLux/X-series)", status: "INFO", draft: "3 รุ่น", live: "prod: inner_top_stack/inner_top_slimlux (เลือกได้)", note: "" },
        bool("o_opentype", true, "ชนิดการเปิด"),
        bool("o_track", true, "ราง (บน): โชว์/ซ่อน"),
        defCheck("ราง (บน) default", "โชว์ราง", P.def_track, ""),
        bool("o_slidelock", true, "ชุดล็อค"),
        defCheck("ชุดล็อค default", "ไม่มี", P.def_slidelock, "ดราฟ: เลื่อนภายใน default = ไม่มีชุดล็อก"),
        { key: "มุ้ง (ดราฟ: ตัดออก)", draft: "ไม่มี", live: P.o_mosq ? "มี (เกิน)" : "ไม่มี (ถูก)", status: P.o_mosq ? "EXTRA" : "OK", note: "ดราฟ: ตัดมุ้งเลื่อนภายใน" },
        bool("o_gridmark", true, "คาดตาราง"),
        // มือจับ: X-series ฟรี (brands สแตน/ดิจิ)
        { key: "มือจับ brands (สแตน/ดิจิ ไม่มี cmech)", draft: "มี 2 brands (สแตน/ดิจิ)", live: P.handle_brands.join(",") || "ไม่มี", status: P.handle_brands.includes("stainless") || P.handle_brands.includes("digital") ? "OK" : "MISS", note: "เว็บ inner_top_stack ไม่มี handle_brands=[] → ดราฟบอกสแตน/ดิจิ แต่เว็บยังไม่แสดง" },
        // z3: Soft Close/สลิง/ซ่อนคาน/ฝังรางยู/เสริมคาน
        bool("o_softclose", true, "Soft Close +4,000"),
        bool("o_sling", true, "สลิง 2,000/บาน"),
        bool("o_beamhide", true, "ซ่อนคาน"),
        bool("o_railyu", true, "ฝังรางยู"),
        bool("o_beamsupp", true, "เสริมคาน"),
        bool("i_color", true, "สี/กระจก"),
        bool("o_removeold", true, "รื้อ"),
        { key: "งานเสริม / หมายเหตุ", draft: "มี", live: P.note_opt ? "มี" : "ไม่มี", status: P.note_opt ? "OK" : "MISS", note: "" },
        { key: "ผสมบาน", draft: "มี", live: P.subitem_shown ? "มี" : "ซ่อน", status: P.subitem_shown ? "OK" : "MISS", note: "" },
      ],
    },

    // ===== 3. บานเปิด =====
    casement: {
      name: "บานเปิด", prodId: "casement_euro",
      draftControls: [
        { key: "รุ่น (ยูโร/X-series/Velora/โซลิด ทู/โซลิด วัน)", status: "INFO", draft: "5 รุ่น", live: "prod: casement_euro/casement_xseries/casement_velora/casement_flush_solid/casement_inset_solid", note: "" },
        bool("o_thresh", true, "ธรณี"),
        defCheck("ธรณี default", "std", P.def_thresh, "เว็บ='std'=กันน้ำ ตรงดราฟ"),
        bool("o_closer", true, "โช้คอัพประตู (Velora=ไม่มี)"),
        bool("o_lock", true, "ชุดล็อค"),
        defCheck("ชุดล็อค default", "มีล็อค+กุญแจ", P.def_lock, "เว็บ='มีล็อค+กุญแจ' = ดราฟ 'มีชุดล็อก + กุญแจ' ถูกต้อง"),
        { key: "มือจับ brands (cmech/ดิจิ/สแตน/รุ่นอื่น)", draft: "4 brands", live: P.handle_brands.join(","), status: P.handle_brands.includes("cmech") && P.handle_brands.length >= 4 ? "OK" : "MISS", note: "" },
        bool("o_mosq", true, "มุ้ง"),
        bool("o_gridmark", true, "คาดตาราง"),
        { key: "ช่องแสง o-solidlight (เฉพาะโซลิด)", draft: "มี (เฉพาะโซลิด รุ่น)", live: "render casement_euro ไม่มี o-solidlight — ถูกต้อง (เฉพาะโซลิด)", status: "OK", note: "probe บน casement_euro ไม่มี solidlight ถูก" },
        { key: "ตารางเต็มบาน o-fullgrid (เฉพาะโซลิด)", draft: "มี (เฉพาะโซลิด)", live: P.o_fullgrid ? "มี" : "ไม่มี (casement_euro=ถูก)", status: "OK", note: "probe บน casement_euro ไม่มี = ถูก" },
        bool("o_combo", true, "combo บานกระทุ้งเข้าใน (ยูโร/โซลิด)"),
        bool("i_color", true, "สี/กระจก"),
        bool("o_fcsides", true, "ครอบวงกบ"),
        bool("o_dfm", true, "ดรอปพื้น"),
        bool("o_removeold", true, "รื้อ"),
        { key: "ผสมบาน", draft: "มี", live: P.subitem_shown ? "มี" : "ซ่อน", status: P.subitem_shown ? "OK" : "MISS", note: "" },
      ],
    },

    // ===== 4. บานกระทุ้ง =====
    awning: {
      name: "บานกระทุ้ง", prodId: "awning_euro",
      draftControls: [
        { key: "รุ่น (ยูโรเดียว)", status: "INFO", draft: "ยูโร", live: "prod: awning_euro", note: "" },
        { key: "ประเภท default (หน้าต่าง)", draft: "หน้าต่าง", live: P.def_itype || "null", status: P.def_itype === "window" ? "OK" : "DIFF", note: "ดราฟ: บานกระทุ้ง default=หน้าต่าง" },
        bool("o_lock", true, "ชุดล็อค"),
        defCheck("ชุดล็อค default", "มีล็อค+กุญแจ", P.def_lock, ""),
        bool("o_awnbrace", true, "เสริมแขนค้ำ +500"),
        { key: "มือจับ Cmech หลบมุ้ง", draft: "มี brand='cmechawn'", live: P.handle_brands.includes("cmechawn") ? "มี cmechawn" : `ไม่มี (brands: ${P.handle_brands.join(",") || "none"})`, status: P.handle_brands.includes("cmechawn") ? "OK" : "MISS", note: "ดราฟ: บานกระทุ้งใช้ cmechawn brand" },
        { key: "แบบเปิด (เปิดล่าง/เปิดข้าง/tilt&turn)", draft: "มี 3 แบบ", live: P.has_tilt_turn ? "มี (พบ tilt ใน select)" : "ไม่พบ tilt&turn option", status: P.has_tilt_turn ? "OK" : "MISS", note: "ดราฟ: เปิดล่าง(default)/เปิดข้าง/tilt&turn" },
        bool("o_mosq", true, "มุ้ง"),
        bool("o_gridmark", true, "คาดตาราง"),
        bool("i_color", true, "สี/กระจก"),
        bool("o_fcsides", true, "ครอบวงกบ"),
        bool("o_dfm", true, "ดรอปพื้น"),
        bool("o_removeold", true, "รื้อ"),
        { key: "ผสมบาน", draft: "มี", live: P.subitem_shown ? "มี" : "ซ่อน", status: P.subitem_shown ? "OK" : "MISS", note: "" },
      ],
    },

    // ===== 5. บานหมุน =====
    pivot: {
      name: "บานหมุน", prodId: "pivot",
      draftControls: [
        { key: "รุ่นเมืองทอง", status: "INFO", draft: "รุ่นเดียว", live: "prod: pivot", note: "" },
        bool("o_lock", true, "ชุดล็อค 3 แบบ"),
        { key: "มือจับ ดิจิตอล (ไม่มี Cmech)", draft: "digital/stainless — ไม่มี cmech", live: P.handle_brands.join(",") || "ไม่มี", status: !P.handle_brands.includes("cmech") && (P.handle_brands.includes("digital") || P.handle_brands.includes("stainless")) ? "OK" : "MISS", note: "ดราฟ: ไม่มี Cmech บานหมุน" },
        { key: "มุ้ง (ดราฟ: ตัดออก)", draft: "ไม่มี", live: P.o_mosq ? "มี (เกิน)" : "ไม่มี (ถูก)", status: P.o_mosq ? "EXTRA" : "OK", note: "" },
        bool("o_gridmark", true, "คาดตาราง"),
        bool("i_color", true, "สี/กระจก"),
        bool("o_fcsides", true, "ครอบวงกบ"),
        bool("o_removeold", true, "รื้อ"),
        { key: "ผสมบาน", draft: "มี", live: P.subitem_shown ? "มี" : "ซ่อน", status: P.subitem_shown ? "OK" : "MISS", note: "" },
      ],
    },

    // ===== 6. บานเฟี้ยม =====
    folding: {
      name: "บานเฟี้ยม", prodId: "folding",
      draftControls: [
        { key: "รุ่น (เซมิยูโร/ยูโร/X-series)", status: "INFO", draft: "3 รุ่น", live: "prod: folding/folding_euro/folding_xseries", note: "" },
        bool("o_folddir", true, "ทิศเปิด (เปิดซ้าย/ขวา/แยกกลาง)"),
        defCheck("ทิศเปิด default", "เปิดซ้าย", P.def_folddir, ""),
        bool("o_threshf", true, "ธรณีเฟี้ยม"),
        defCheck("ธรณีเฟี้ยม default", "outer", P.def_threshf, "outer=กันน้ำภายนอก ตรงดราฟ"),
        bool("o_lock", true, "ชุดล็อค"),
        defCheck("ชุดล็อค default", "มีล็อค+กุญแจ", P.def_lock, ""),
        bool("o_mosq", true, "มุ้ง (X-series ตัด)"),
        bool("o_gridmark", true, "คาดตาราง"),
        bool("i_color", true, "สี/กระจก"),
        bool("o_fcsides", true, "ครอบวงกบ"),
        { key: "ซ่อนคาน (z3)", draft: "มี (o-beamhide)", live: P.o_beamhide ? "มี" : "ไม่มี", status: P.o_beamhide ? "OK" : "MISS", note: "ดราฟ z3 บานเฟี้ยม" },
        { key: "ซ่อนราง (เซมิ/X)", draft: "มี (o-railhide)", live: P.o_railhide ? "มี" : "ไม่มี", status: P.o_railhide ? "OK" : "MISS", note: "" },
        { key: "ฝังรางยู (เซมิ/X)", draft: "มี (o-railyu)", live: P.o_railyu ? "มี" : "ไม่มี", status: P.o_railyu ? "OK" : "MISS", note: "" },
        { key: "เสริมคาน", draft: "มี (o-beamsupp)", live: P.o_beamsupp ? "มี" : "ไม่มี", status: P.o_beamsupp ? "OK" : "MISS", note: "" },
        bool("o_dfm", true, "ดรอปพื้น"),
        bool("o_removeold", true, "รื้อ"),
        { key: "ผสมบาน", draft: "มี", live: P.subitem_shown ? "มี" : "ซ่อน", status: P.subitem_shown ? "OK" : "MISS", note: "" },
      ],
    },

    // ===== 7. กระจกติดตาย =====
    fixed_glass: {
      name: "กระจกติดตาย", prodId: "fixed_glass",
      draftControls: [
        { key: "รุ่นเดียว (ไม่มีตัวเลือก)", status: "INFO", draft: "รุ่นเดียว", live: "prod: fixed_glass", note: "ดราฟ: ตัดชนิดเปิด/ราง/ล็อค/มือจับ/มุ้ง" },
        { key: "ชนิดเปิด/ราง/ล็อค/มือจับ/มุ้ง = ตัดออก", draft: "ไม่มีทั้งหมด", live: [P.o_opentype,P.o_bottomrail,P.o_slidelock,P.o_lock,P.o_mosq].some(Boolean) ? "มีบางตัว (เกิน)" : "ไม่มีทั้งหมด (ถูก)", status: [P.o_opentype,P.o_bottomrail,P.o_slidelock,P.o_lock,P.o_mosq].some(Boolean) ? "EXTRA" : "OK", note: "" },
        bool("o_gridmark", true, "คาดตาราง"),
        bool("i_color", true, "สี/กระจก"),
        bool("o_fcsides", true, "ครอบวงกบ"),
        bool("o_removeold", true, "รื้อ"),
        { key: "งานเสริม", draft: "มี", live: P.note_opt ? "มี" : "ไม่มี", status: P.note_opt ? "OK" : "MISS", note: "" },
        { key: "ผสมบาน (ดราฟ: ไม่มี/ไม่ระบุ)", status: "INFO", draft: "ดราฟไม่ระบุ", live: P.subitem_shown ? "มี (แสดงอยู่)" : "ไม่มี", note: "ติดตายไม่น่ามีผสมบาน" },
      ],
    },

    // ===== 8. บานเปลือย (ติดตาย+ประตู รวม) =====
    frameless: {
      name: "บานเปลือย (ติดตาย + ประตู รวม)", prodId: "frameless_fixed",
      draftControls: [
        { key: "ปุ่มประเภท 3 ตัว (ติดตาย/ประตู-สวิง/ประตู-เลื่อน)", draft: "มี 3 ตัว", live: P.frameless_chips.join(" / ") || "ไม่มี", status: P.frameless_chips.length === 3 ? "OK" : "MISS", note: "" },
        { key: "default ประเภท = ติดตาย", draft: "ติดตาย", live: P.def_frameless || "null", status: P.def_frameless === "ติดตาย" ? "OK" : "DIFF", note: "" },
        { key: "สีเฟรมอลู (o-framecolor)", draft: "มี (ทุกประเภท)", live: P.o_framecolor ? "มี" : "ไม่มี", status: P.o_framecolor ? "OK" : "MISS", note: "" },
        { key: "มือจับสแตนเลส o-stainless (เฉพาะประตู)", draft: "มี (เฉพาะประตู ไม่มีดิจิตอล)", live: "probe frameless_fixed (ติดตาย) ไม่มี handle = ถูกต้อง", status: "OK", note: "เมื่อสลับเป็น frameless_door handle brands จะโผล่ (ต้องตรวจตา)" },
        { key: "ชุดล็อค (เฉพาะประตู)", draft: "มี (เฉพาะ frameless_door)", live: P.o_lock ? "มี (บน fixed=เกิน?)" : "ไม่มีบน frameless_fixed (ถูก)", status: !P.o_lock ? "OK" : "DIFF", note: "frameless_fixed ไม่มีล็อค ถูกต้อง" },
        { key: "ไม่มีครอบวงกบ (ดราฟ: frameless)", draft: "ไม่มี", live: P.o_fcsides ? "มี (เกิน)" : "ไม่มี (ถูก)", status: P.o_fcsides ? "EXTRA" : "OK", note: "" },
        bool("o_gridmark", true, "คาดตาราง"),
        bool("i_color", true, "สี/กระจก (สีเฟรม)"),
        bool("o_removeold", true, "รื้อ"),
        { key: "ผสมบาน", draft: "มี", live: P.subitem_shown ? "มี" : "ซ่อน", status: P.subitem_shown ? "OK" : "MISS", note: "" },
      ],
    },

    // ===== 9. ผนัง =====
    wall: {
      name: "ผนัง (ทึบ/ฉนวน)", prodId: "wall_ext",
      draftControls: [
        { key: "รุ่น (ภายนอก/ภายใน/ISOWALL)", status: "INFO", draft: "3 รุ่น", live: "prod: wall_ext/wall_int/isowall", note: "" },
        bool("o_wallframe", true, "โครง (เหล็กชุบ/อลู)"),
        { key: "ความหนา (สมาร์ทบอร์ด/ISOWALL)", status: "INFO", draft: "มี 2 ตัวเลือก", live: "probe ผ่าน wall_ext (ต้องตรวจตา)", note: "" },
        { key: "ทาสี/ฉนวน", status: "INFO", draft: "มี: ทาขาว/รองพื้น/ไม่ทา + ฉนวน", live: "probe ผ่าน wall_ext (ต้องตรวจตา)", note: "" },
        { key: "สี/กระจก (ดราฟ: ตัดออก)", draft: "ไม่มี", live: P.i_color ? "มี i-color (เกิน?)" : "ไม่มี (ถูก)", status: P.i_color ? "EXTRA" : "OK", note: "ดราฟ: ผนัง/YKK ไม่มี L1-L3" },
        { key: "มุ้ง/คาด/ทึบ/ผสมบาน = ตัดออก", draft: "ไม่มี", live: [P.o_mosq,P.o_gridmark,P.subitem_shown].some(Boolean) ? "มีบางตัว" : "ไม่มี (ถูก)", status: [P.o_mosq,P.o_gridmark,P.subitem_shown].some(Boolean) ? "EXTRA" : "OK", note: "" },
        bool("o_removeold", true, "รื้อ"),
        { key: "หมายเหตุ", draft: "มี", live: P.note_opt ? "มี" : "ไม่มี", status: P.note_opt ? "OK" : "MISS", note: "" },
      ],
    },

    // ===== 10. ดัดโค้ง =====
    curved: {
      name: "ดัดโค้ง", prodId: "curved_double",
      draftControls: [
        { key: "รุ่น (บานคู่/บานเดี่ยว/ติดตายโค้ง/สลิม)", status: "INFO", draft: "4 รุ่น", live: "prod: curved_double/curved_single/curved_fixed/curved_slim", note: "" },
        { key: "ประเภท default (ประตู)", draft: "ประตู", live: P.def_itype || "null", status: P.def_itype === "door" ? "OK" : "DIFF", note: "" },
        bool("o_lock", true, "ชุดล็อค"),
        defCheck("ชุดล็อค default", "มีล็อค+กุญแจ", P.def_lock, ""),
        { key: "มือจับ ดิจิตอล/สแตน (ติดตายโค้ง=ไม่มี)", draft: "digital/stainless ไม่มี cmech", live: P.handle_brands.join(",") || "ไม่มี", status: !P.handle_brands.includes("cmech") && (P.handle_brands.includes("digital") || P.handle_brands.length > 0) ? "OK" : "MISS", note: "" },
        bool("o_gridmark", true, "คาดตาราง"),
        bool("i_color", true, "สี/กระจก (กระจกปกติทุกแบบ)"),
        bool("o_fcsides", true, "ครอบวงกบ"),
        bool("o_dfm", true, "ดรอปพื้น"),
        bool("o_removeold", true, "รื้อ"),
        { key: "ผสมบาน", draft: "ไม่ระบุ", live: P.subitem_shown ? "มี" : "ไม่มี", status: "INFO", note: "" },
      ],
    },

    // ===== 11. PC Door =====
    pc_door: {
      name: "PC Door", prodId: "pc_door_2",
      draftControls: [
        { key: "รุ่น (2 บาน/4 บาน)", status: "INFO", draft: "2 รุ่น", live: "prod: pc_door_2/pc_door_4", note: "" },
        bool("o_slidelock", true, "ชุดล็อค (o-slidelock)"),
        defCheck("ชุดล็อค default", "มีกุญแจ", P.def_slidelock, "เว็บ='มีกุญแจ' = 'มีชุดล็อก + กุญแจ' ถูก"),
        { key: "มือจับ (ดิจิ/สแตน ไม่มี cmech)", draft: "digital/stainless", live: P.handle_brands.join(",") || "ไม่มี", status: !P.handle_brands.includes("cmech") && P.handle_brands.length > 0 ? "OK" : "MISS", note: "" },
        bool("o_mosq", true, "มุ้ง"),
        bool("o_gridmark", true, "คาดตาราง"),
        bool("i_color", true, "สี/กระจก"),
        bool("o_fcsides", true, "ครอบวงกบ"),
        bool("o_dfm", true, "ดรอปพื้น"),
        { key: "ฝังรางยู (ดราฟ: ตัดออก)", draft: "ไม่มี", live: P.o_railyu ? "มี (เกิน)" : "ไม่มี (ถูก)", status: P.o_railyu ? "EXTRA" : "OK", note: "" },
        bool("o_removeold", true, "รื้อ"),
        { key: "ผสมบาน", draft: "มี", live: P.subitem_shown ? "มี" : "ซ่อน", status: P.subitem_shown ? "OK" : "MISS", note: "" },
      ],
    },

    // ===== 12. YKK =====
    ykk: {
      name: "YKK", prodId: "ykk_vent",
      draftControls: [
        { key: "รุ่น (Ventilation/Exhido/Tostem A01)", status: "INFO", draft: "3 รุ่น", live: "prod: ykk_vent/ykk_exhido/tostem_a01", note: "" },
        { key: "ประเภท (ประตูเท่านั้น ตัดหน้าต่าง)", status: "INFO", draft: "ประตูเท่านั้น", live: "probe ผ่าน ykk_vent (ต้องตรวจตา)", note: "" },
        bool("o_closer", true, "โช้คอัพ (ไม่มี/มี +5,000)"),
        bool("o_fcsides", true, "ครอบวงกบ"),
        bool("o_dfm", true, "ดรอปพื้น"),
        bool("o_removeold", true, "รื้อ"),
        { key: "สี/กระจก (ดราฟ: ตัดออก)", draft: "ไม่มี", live: P.i_color ? "มี i-color (เกิน?)" : "ไม่มี (ถูก)", status: P.i_color ? "EXTRA" : "OK", note: "ดราฟ: YKK ไม่มี L1-L3 ไม่มีกระจก" },
        { key: "ล็อค/มุ้ง/คาด/ทึบ/ผสมบาน = ตัดออก", draft: "ไม่มี", live: [P.o_lock,P.o_mosq,P.o_gridmark,P.subitem_shown].some(Boolean) ? "มีบางตัว" : "ไม่มี (ถูก)", status: [P.o_lock,P.o_mosq,P.o_gridmark].some(Boolean) ? "EXTRA" : "OK", note: "" },
      ],
    },

    // ===== 13. บานยก =====
    lift: {
      name: "บานยก", prodId: "lift_sms",
      draftControls: [
        { key: "รุ่น (SMS สลิม/เซมิยูโร)", status: "INFO", draft: "2 รุ่น", live: "prod: lift_sms/lift_aluinch", note: "" },
        { key: "ประเภท (หน้าต่างเท่านั้น)", draft: "หน้าต่าง", live: P.def_itype || "null", status: P.def_itype === "window" ? "OK" : "DIFF", note: "ดราฟ: บานยก default=หน้าต่าง" },
        bool("o_liftmode", true, "ลักษณะการยก"),
        defCheck("ลักษณะการยก default", "top", P.def_liftmode, "top=ยกบานบน ตรงดราฟ"),
        bool("o_motor", true, "มอเตอร์"),
        defCheck("มอเตอร์ default", "0", P.def_motor, "0=ไม่มี ตรงดราฟ"),
        bool("o_lock", true, "ชุดล็อค"),
        defCheck("ชุดล็อค default", "มีล็อค+กุญแจ", P.def_lock, ""),
        bool("o_mosq", true, "มุ้ง"),
        bool("o_gridmark", true, "คาดตาราง"),
        bool("i_color", true, "สี/กระจก"),
        { key: "ฝังรางยู (ดราฟ: ตัดออก)", draft: "ไม่มี", live: P.o_railyu ? "มี (เกิน)" : "ไม่มี (ถูก)", status: P.o_railyu ? "EXTRA" : "OK", note: "" },
        bool("o_removeold", true, "รื้อ"),
        { key: "ผสมบาน", draft: "มี", live: P.subitem_shown ? "มี" : "ซ่อน", status: P.subitem_shown ? "OK" : "MISS", note: "" },
      ],
    },

    // ===== 14. shower =====
    shower: {
      name: "shower (ฉากกั้นอาบน้ำ)", prodId: "shower",
      draftControls: [
        bool("o_shtype", true, "รูปแบบ shower (3 แบบ)"),
        defCheck("รูปแบบ default", "door_fixed", P.def_shtype, "door_fixed=ประตู+กระจกติดตาย ตรงดราฟ"),
        bool("o_shdoortype", true, "ประเภทประตู (บานเปิด/เลื่อน)"),
        defCheck("ประเภทประตู default", "swing", P.def_shdoortype, "swing=บานเปิด ตรงดราฟ"),
        { key: "สีอุปกรณ์ (เงิน/ดำ/ทอง)", draft: "มี 3 สี (o-shcolor)", live: P.o_shcolor ? "มี" : "ไม่มี", status: P.o_shcolor ? "OK" : "MISS", note: "ดราฟ: เงิน(default)/ดำ +4,000/ทอง +6,000" },
        bool("o_shcorner", true, "เข้ามุม +3,000"),
        bool("i_color", true, "สี/กระจก (กระจกเท่านั้น)"),
        bool("o_removeold", true, "รื้อ"),
        { key: "มุ้ง/คาด/ทึบ/ผสมบาน = ตัดออก", draft: "ไม่มี", live: [P.o_mosq,P.o_gridmark,P.subitem_shown].some(Boolean) ? "มีบางตัว" : "ไม่มี (ถูก)", status: [P.o_mosq,P.o_gridmark,P.subitem_shown].some(Boolean) ? "EXTRA" : "OK", note: "" },
      ],
    },
  };
}

// ==============================
// Probe ทุก prod
// ==============================
const PROD_IDS = {
  slide: "sliding_sms", inner: "inner_top_stack", casement: "casement_euro",
  awning: "awning_euro", pivot: "pivot", folding: "folding",
  fixed_glass: "fixed_glass", frameless: "frameless_fixed", wall: "wall_ext",
  curved: "curved_double", pc_door: "pc_door_2", ykk: "ykk_vent",
  lift: "lift_sms", shower: "shower",
};
const probed = {};
for (const [key, pid] of Object.entries(PROD_IDS)) {
  console.log(`  probe: ${pid}`);
  probed[key] = probe(pid);
}

const SPECS = {};
for (const [key, pid] of Object.entries(PROD_IDS)) {
  if (!probed[key]) { SPECS[key] = { name: key, prodId: pid, draftControls: [{ key: "RENDER FAILED", status: "MISS", draft: pid, live: "เลือกไม่ได้ใน G1", note: "" }] }; continue; }
  const allSpecs = buildSpecs(probed[key]);
  SPECS[key] = allSpecs[key];
}

// ==============================
// สถิติ
// ==============================
const esc = s => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const icon = { OK: "🟢", MISS: "🔴", EXTRA: "🟠", DIFF: "🟡", INFO: "⬜" };
const bg = { OK: "#f0fdf4", MISS: "#fef2f2", EXTRA: "#fff7ed", DIFF: "#fefce8", INFO: "#f9fafb" };

function specStats(spec) {
  const rows = spec.draftControls || [];
  return {
    ok: rows.filter(r => r.status === "OK").length,
    miss: rows.filter(r => r.status === "MISS").length,
    extra: rows.filter(r => r.status === "EXTRA").length,
    diff: rows.filter(r => r.status === "DIFF").length,
    info: rows.filter(r => r.status === "INFO").length,
  };
}

const ALL_SPECS = Object.values(SPECS);
const totals = ALL_SPECS.reduce((a, s) => {
  const st = specStats(s);
  a.ok += st.ok; a.miss += st.miss; a.extra += st.extra; a.diff += st.diff;
  return a;
}, { ok: 0, miss: 0, extra: 0, diff: 0 });
const perfect = ALL_SPECS.filter(s => { const st = specStats(s); return st.miss === 0 && st.extra === 0 && st.diff === 0; });

// ==============================
// Build HTML
// ==============================
function buildBlock(spec) {
  const st = specStats(spec);
  const isClean = st.miss === 0 && st.extra === 0 && st.diff === 0;
  const rows = spec.draftControls || [];
  const sorted = [...rows].sort((a, b) => {
    const ord = { MISS: 0, EXTRA: 1, DIFF: 2, OK: 3, INFO: 4 };
    return (ord[a.status] || 9) - (ord[b.status] || 9);
  });

  return `
<div class="spec-block" id="spec-${spec.name?.replace(/\s/g,"-") || "x"}">
  <div class="spec-header" style="border-left:4px solid ${isClean ? "#1E7E45" : "#B3151D"};">
    <div class="spec-title">${esc(spec.name)}</div>
    <div class="spec-pills">
      ${st.miss > 0 ? `<span class="pill pill-miss">🔴 ขาด ${st.miss}</span>` : ""}
      ${st.extra > 0 ? `<span class="pill pill-extra">🟠 เกิน ${st.extra}</span>` : ""}
      ${st.diff > 0 ? `<span class="pill pill-diff">🟡 default ต่าง ${st.diff}</span>` : ""}
      ${isClean ? `<span class="pill pill-ok">🟢 ตรงทั้งหมด</span>` : ""}
    </div>
    <div class="spec-meta">probe prod: <code>${esc(spec.prodId)}</code></div>
  </div>
  <table class="diff-table">
    <tr><th>ปุ่ม/control</th><th>📋 ดราฟเกณฑ์</th><th>🌐 เว็บสดจริง</th><th>สถานะ</th><th>หมายเหตุ</th></tr>
    ${sorted.map(row => `<tr style="background:${bg[row.status] || "#fff"};">
      <td>${esc(row.key)}</td>
      <td>${esc(row.draft || "")}</td>
      <td>${esc(row.live || "")}</td>
      <td style="text-align:center;">${icon[row.status] || "?"}</td>
      <td style="font-size:11px;color:#6b7280;">${esc(row.note || "")}</td>
    </tr>`).join("")}
  </table>
</div>`;
}

const summaryRows = ALL_SPECS.map(s => {
  const st = specStats(s);
  const isClean = st.miss === 0 && st.extra === 0 && st.diff === 0;
  const diffItems = (s.draftControls || []).filter(r => r.status !== "OK" && r.status !== "INFO").map(r => `${icon[r.status]} ${r.key}`).join(" · ") || "-";
  return `<tr style="background:${isClean ? "#f0fdf4" : "#fef2f2"};">
    <td><a href="#spec-${(s.name || "").replace(/\s/g, "-")}">${esc(s.name)}</a></td>
    <td style="text-align:center;">${isClean ? "🟢 ตรง 100%" : "🔴 มีจุดต่าง"}</td>
    <td style="text-align:center;color:#1E7E45;">${st.ok}</td>
    <td style="text-align:center;color:#B3151D;">${st.miss}</td>
    <td style="text-align:center;color:#9a3412;">${st.extra}</td>
    <td style="text-align:center;color:#854d0e;">${st.diff}</td>
    <td style="font-size:11px;">${diffItems}</td>
  </tr>`;
}).join("");

const specBlocks = ALL_SPECS.map(buildBlock).join("\n");

const outHtml = `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>COMPARE G1 เว็บสด vs ดราฟ 2026-06-23</title>
<style>
:root{--red:#B3151D;--ok:#1E7E45;--line:#E5E7EB;--mut:#6B7280;}
*{box-sizing:border-box;}
body{font-family:"Sarabun","Leelawadee UI",Tahoma,sans-serif;font-size:13px;background:#F7F8FA;color:#1F2937;margin:0;}
.wrap{max-width:1100px;margin:0 auto;padding:16px 14px 60px;}
h1{color:var(--red);font-size:20px;border-bottom:3px solid var(--red);padding-bottom:8px;margin-top:0;}
.meta{font-size:12px;color:var(--mut);margin-bottom:16px;line-height:1.6;}
.summary-card{background:#fff;border:2px solid var(--red);border-radius:12px;padding:14px 16px;margin-bottom:20px;}
.summary-card h2{color:var(--red);font-size:16px;margin:0 0 10px;}
.pills-row{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;}
.pill{padding:5px 12px;border-radius:20px;font-weight:700;font-size:12.5px;}
.pill-ok{background:#dcfce7;color:#166534;}
.pill-miss{background:#fee2e2;color:#991b1b;}
.pill-extra{background:#ffedd5;color:#9a3412;}
.pill-diff{background:#fef9c3;color:#854d0e;}
.sum-table{width:100%;border-collapse:collapse;font-size:12.5px;}
.sum-table th{background:#fbe9ea;color:var(--red);padding:6px 8px;text-align:left;border:1px solid var(--line);}
.sum-table td{border:1px solid var(--line);padding:5px 8px;vertical-align:top;}
.sum-table a{color:#1E5AA8;text-decoration:none;}
.spec-block{background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px;margin-bottom:16px;}
.spec-header{padding:8px 12px;border-radius:8px;background:#fafafa;margin-bottom:10px;display:flex;flex-wrap:wrap;gap:6px;align-items:center;}
.spec-title{font-weight:800;font-size:15px;color:var(--red);flex:0 0 auto;}
.spec-pills{display:flex;gap:5px;flex-wrap:wrap;flex:1;}
.spec-meta{width:100%;font-size:11px;color:var(--mut);}
.diff-table{width:100%;border-collapse:collapse;font-size:12px;background:#fff;}
.diff-table th{background:#FBE9EA;color:var(--red);padding:5px 7px;text-align:left;border:1px solid var(--line);}
.diff-table td{border:1px solid var(--line);padding:4px 7px;vertical-align:top;}
code{background:#f3f4f6;padding:0 4px;border-radius:3px;font-size:11px;}
</style>
</head>
<body>
<div class="wrap">

<h1>🔍 หน้าเทียบคู่ G1 — เว็บสดจริง vs ดราฟเกณฑ์</h1>
<div class="meta">
  วันที่: 23 มิ.ย. 2569 · ดราฟ: DRAFT-G1-GROUNDTRUTH-ปุ่มทุกปุ่ม-2026-06-22.html · เว็บสด: public/calculator/index.html<br>
  render jsdom สด ทีละ prod (fresh ทุกครั้ง กัน orphan DOM) · เทียบ class จริงกับเกณฑ์ดราฟ<br>
  🟢 ตรง · 🔴 ขาด (ดราฟมี เว็บไม่มี) · 🟠 เกิน (เว็บมี ดราฟไม่มี) · 🟡 default ต่าง · ⬜ INFO (ต้องตรวจตา)
</div>

<div class="summary-card">
  <h2>สรุปรวมทุกชนิด (14 ชนิด)</h2>
  <div class="pills-row">
    <span class="pill pill-ok">🟢 ตรง ${totals.ok}</span>
    <span class="pill pill-miss">🔴 ขาด ${totals.miss}</span>
    <span class="pill pill-extra">🟠 เกิน ${totals.extra}</span>
    <span class="pill pill-diff">🟡 default ต่าง ${totals.diff}</span>
  </div>
  <p style="font-size:13px;margin:8px 0;">ตรง 100%: <strong>${perfect.length}/${ALL_SPECS.length}</strong> ชนิด
  ${perfect.length < ALL_SPECS.length ? ` · มีจุดต่าง: <strong style="color:var(--red);">${ALL_SPECS.length - perfect.length} ชนิด</strong>` : ""}</p>
  <table class="sum-table">
    <tr><th>ชนิดบาน</th><th>สถานะ</th><th>🟢ตรง</th><th>🔴ขาด</th><th>🟠เกิน</th><th>🟡default</th><th>จุดต่าง</th></tr>
    ${summaryRows}
  </table>
</div>

${specBlocks}

<p style="font-size:11px;color:var(--mut);margin-top:20px;text-align:center;">
  ⬜ INFO = ต้องตรวจตาเบราว์เซอร์จริง (layout/drill-down/cascade) · script probe class จริงใน jsdom · fresh render ทุก prod
</p>
</div>
</body>
</html>`;

writeFileSync(OUT_PATH, outHtml, "utf8");
console.log(`\nเขียนแล้ว: ${OUT_PATH}`);
console.log(`สรุป: ตรง 100% ${perfect.length}/${ALL_SPECS.length} ชนิด · 🔴 ขาด ${totals.miss} · 🟠 เกิน ${totals.extra} · 🟡 default ต่าง ${totals.diff}`);
