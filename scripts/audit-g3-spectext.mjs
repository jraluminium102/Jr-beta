// audit-g3-spectext.mjs — render G3 ด้วย genQuote แล้ว scrape quoteContent text
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";

const html = readFileSync("public/calculator/index.html", "utf8");
const vc = new VirtualConsole();
const errs = [];
vc.on("jsdomError", (e) => errs.push(e.message));
const dom = new JSDOM(html, {
  runScripts: "dangerously", pretendToBeVisual: true,
  virtualConsole: vc, url: "http://localhost/"
});
await new Promise((r) => { dom.window.addEventListener("load", r); setTimeout(r, 2000); });
const w = dom.window, doc = w.document;
const fire = (el, t) => el.dispatchEvent(new w.Event(t, { bubbles: true }));
const setF = (ch, s, v) => {
  const el = ch ? ch.querySelector(s) : doc.querySelector(s);
  if (el) { el.value = String(v); fire(el, "input"); fire(el, "change"); }
};
const clickChip = (ch, text) => {
  const btns = (ch || doc).querySelectorAll("button");
  for (const b of btns) { if (b.textContent.trim() === text) { b.click(); return true; } }
  return false;
};
const chkEl = (ch, s, v) => {
  const el = (ch||doc).querySelector(s); if (!el) return;
  el.checked = v; fire(el, "change");
};

function reset() {
  doc.getElementById("items").innerHTML = "";
  // ปิด svc-protect
  const sp = doc.getElementById("svc-protect");
  if (sp && sp.checked) { sp.checked = false; fire(sp, "change"); }
}

function addItem(grp, prod) {
  w.addItem(doc.getElementById("items"));
  const chs = [...doc.querySelectorAll("#items .ch")];
  const ch = chs[chs.length - 1];
  setF(ch, ".i-group", grp);
  fire(ch.querySelector(".i-group"), "change");
  const ps = ch.querySelector(".i-prod");
  if (ps) { ps.value = prod; fire(ps, "change"); }
  return ch;
}

function getQuote() {
  try { w.genQuote && w.genQuote(); w.calcQuote && w.calcQuote(); } catch(e) {}
  const el = doc.getElementById("quoteContent");
  return el ? (el.innerText || el.textContent || "").trim() : "(ไม่พบ)";
}

// --- ดึง itemDetail text จาก readItem ---
function getItemDetail(ch) {
  try {
    const r = w.readItem(ch);
    if (!r || !r.r) return { det:"", sell:0 };
    // det อาจอยู่ใน r.r.det หรือ r.r.detLine
    const sell = Math.round(r.r.sell || 0);
    // รวม msgs
    const msgs = Array.isArray(r.r.msgs) ? r.r.msgs.join(" | ") : String(r.r.msgs||"");
    return { det: msgs, sell };
  } catch(e) { return { det:"err:"+e.message, sell:0 }; }
}

const results = [];

// ===== เคส A: หลังคาโพลีตัน แปเดี่ยว ปล่อยปลาย =====
reset();
{ const ch = addItem(3, "roof_polyton");
  setF(ch, ".i-w", 5); setF(ch, ".i-h", 2);
  clickChip(ch, "แปเดี่ยว");
  clickChip(ch, "ปล่อย");
  w.calcQuote && w.calcQuote();
  const q = getQuote();
  const d = getItemDetail(ch);
  results.push({ case:"A: หลังคาโพลีตัน แปเดี่ยว ปล่อยปลาย", sell:d.sell, msgs:d.det, quote:q.substring(0,600) });
}

// ===== เคส B: หลังคาโพลีตัน แปเดี่ยว รางน้ำ + ตะแกรง + ท่อสีดำ =====
reset();
{ const ch = addItem(3, "roof_polyton");
  setF(ch, ".i-w", 6); setF(ch, ".i-h", 3.5);
  clickChip(ch, "แปเดี่ยว");
  clickChip(ch, "รางน้ำ");
  clickChip(ch, "ท่อ");
  clickChip(ch, "ดำ");
  chkEl(ch, ".o-rfleaf", true);
  w.calcQuote && w.calcQuote();
  const q = getQuote();
  const d = getItemDetail(ch);
  results.push({ case:"B: หลังคาโพลีตัน แปเดี่ยว รางน้ำ+ตะแกรง+ท่อPVCดำ", sell:d.sell, msgs:d.det, quote:q.substring(0,800) });
}

// ===== เคส C: หลังคาโพลีตัน แปเดี่ยว รางน้ำ + โซ่ทิวลิป น้ำตาล 2 เส้น =====
reset();
{ const ch = addItem(3, "roof_polyton");
  setF(ch, ".i-w", 6); setF(ch, ".i-h", 4.5);
  clickChip(ch, "แปเดี่ยว");
  clickChip(ch, "รางน้ำ");
  clickChip(ch, "โซ่");
  clickChip(ch, "ทิวลิป");
  clickChip(ch, "น้ำตาล");
  const rfchain = ch.querySelector(".o-rfchain");
  if (rfchain) { rfchain.value = "2"; fire(rfchain, "input"); fire(rfchain, "change"); }
  w.calcQuote && w.calcQuote();
  const q = getQuote();
  const d = getItemDetail(ch);
  results.push({ case:"C: หลังคาโพลีตัน+รางน้ำ+โซ่ทิวลิปน้ำตาล 2 เส้น", sell:d.sell, msgs:d.det, quote:q.substring(0,800) });
}

// ===== เคส D: หลังคาไวนิล รางน้ำ + โซ่ทิวลิป 1 เส้น + ซ่อนสโลปคอมโพสิต สีดำ =====
reset();
{ const ch = addItem(3, "roof_vinyl");
  setF(ch, ".i-w", 5); setF(ch, ".i-h", 4.29);
  clickChip(ch, "แปเดี่ยว");
  clickChip(ch, "รางน้ำ");
  clickChip(ch, "โซ่");
  clickChip(ch, "ทิวลิป");
  clickChip(ch, "น้ำตาล");
  const rfchain = ch.querySelector(".o-rfchain");
  if (rfchain) { rfchain.value = "1"; fire(rfchain, "input"); fire(rfchain, "change"); }
  // ซ่อนสโลป
  clickChip(ch, "คอมโพสิต");
  const rfhs = ch.querySelector(".o-rfhs");
  if (rfhs) { rfhs.value = "comp"; fire(rfhs, "change"); }
  clickChip(ch, "ดำ");
  const rfhscolor = ch.querySelector(".o-rfhscolor");
  if (rfhscolor) { rfhscolor.value = "ดำ"; fire(rfhscolor, "change"); }
  w.calcQuote && w.calcQuote();
  const q = getQuote();
  const d = getItemDetail(ch);
  results.push({ case:"D: หลังคาไวนิล+รางน้ำ+โซ่ทิวลิป1เส้น+ซ่อนสโลปคอมโพสิตดำ", sell:d.sell, msgs:d.det, quote:q.substring(0,900) });
}

// ===== เคส E: ชินโคไลท์ imp15 HeatCut HC-N828 Modern Grey ปล่อยปลาย =====
reset();
{ const ch = addItem(3, "imp15");
  setF(ch, ".i-w", 4); setF(ch, ".i-h", 3);
  clickChip(ch, "ปล่อย");
  // สี HC-N828
  clickChip(ch, "HC-N828 Modern Grey");
  const rfcol = ch.querySelector(".o-rfcolor");
  if (rfcol) { rfcol.value = "HC-N828 Modern Grey"; fire(rfcol, "change"); }
  w.calcQuote && w.calcQuote();
  const q = getQuote();
  const d = getItemDetail(ch);
  results.push({ case:"E: ชินโคไลท์ imp15 HeatCut HC-N828 Modern Grey ปล่อยปลาย", sell:d.sell, msgs:d.det, quote:q.substring(0,800) });
}

// ===== เคส F: หลังคาดีไลท์ DG7 สีเทาโมเดิร์น ปล่อยปลาย =====
reset();
{ const ch = addItem(3, "roof_delight");
  setF(ch, ".i-w", 4); setF(ch, ".i-h", 3);
  clickChip(ch, "ปล่อย");
  clickChip(ch, "DG7 สีเทาโมเดิร์น");
  const rfcol = ch.querySelector(".o-rfcolor");
  if (rfcol) { rfcol.value = "DG7 สีเทาโมเดิร์น"; fire(rfcol, "change"); }
  w.calcQuote && w.calcQuote();
  const q = getQuote();
  const d = getItemDetail(ch);
  results.push({ case:"F: หลังคาดีไลท์ DG7 สีเทาโมเดิร์น ปล่อยปลาย", sell:d.sell, msgs:d.det, quote:q.substring(0,800) });
}

// ===== เคส G: ฝ้าฉาบเรียบ + ทาสีขาว + ฝ้าเฉียง =====
reset();
{ const ch = addItem(3, "ceiling_smooth");
  setF(ch, ".i-w", 4); setF(ch, ".i-h", 3.26);
  clickChip(ch, "ทาสีขาว");
  const cf = ch.querySelector(".o-ceilfinish"); if (cf) { cf.value = "ทาสีขาว"; fire(cf, "change"); }
  chkEl(ch, ".o-ceilslope", true);
  w.calcQuote && w.calcQuote();
  const q = getQuote();
  const d = getItemDetail(ch);
  results.push({ case:"G: ฝ้าฉาบเรียบ+ทาสีขาว+ฝ้าเฉียง", sell:d.sell, msgs:d.det, quote:q.substring(0,800) });
}

// ===== เคส H: ผนังเบาภายนอก wall_ext 12มม. โครงเหล็กชุบ + ฉนวน 3" =====
reset();
{ const ch = addItem(3, "wall_ext");
  setF(ch, ".i-w", 3); setF(ch, ".i-h", 2.4);
  clickChip(ch, "เหล็กชุบ");
  const wf = ch.querySelector(".o-wallframe"); if (wf) { wf.value = "เหล็กชุบ"; fire(wf, "change"); }
  clickChip(ch, "12 มม.");
  const st = ch.querySelector(".o-smartthick"); if (st) { st.value = "12"; fire(st, "change"); }
  chkEl(ch, ".o-insul", true);
  // ทาสีรองพื้น
  clickChip(ch, "ทาสีรองพื้นสีขาว");
  const wp = ch.querySelector(".o-wallpaint"); if (wp) { wp.value = "ทาสีรองพื้นสีขาว"; fire(wp, "change"); }
  w.calcQuote && w.calcQuote();
  const q = getQuote();
  const d = getItemDetail(ch);
  results.push({ case:"H: ผนังเบาภายนอก 12มม. โครงเหล็กชุบ+ฉนวน3\"", sell:d.sell, msgs:d.det, quote:q.substring(0,800) });
}

// ===== เคส I: หลังคาไวนิล โครงเหล็กชุบซิงค์ ปล่อยปลาย =====
reset();
{ const ch = addItem(3, "roof_vinyl");
  setF(ch, ".i-w", 5); setF(ch, ".i-h", 3);
  clickChip(ch, "เหล็กชุบ");
  const rf = ch.querySelector(".o-roofframe"); if (rf) { rf.value = "โครงเหล็กชุบซิงค์"; fire(rf, "change"); }
  clickChip(ch, "ปล่อย");
  w.calcQuote && w.calcQuote();
  const q = getQuote();
  const d = getItemDetail(ch);
  results.push({ case:"I: หลังคาไวนิล โครงเหล็กชุบซิงค์ ปล่อยปลาย", sell:d.sell, msgs:d.det, quote:q.substring(0,800) });
}

// ===== เคส J: หลังคาโพลีตัน แปคู่ + รางน้ำ + เพลท + เหล็กดึง + ท่อ PVC สีดำ (ใบเฟริล) =====
reset();
{ const ch = addItem(3, "roof_polyton");
  setF(ch, ".i-w", 4.5); setF(ch, ".i-h", 3);
  clickChip(ch, "แปคู่");
  clickChip(ch, "รางน้ำ");
  clickChip(ch, "ท่อ");
  clickChip(ch, "ดำ");
  chkEl(ch, ".o-rfplate", true);
  chkEl(ch, ".o-rfpull", true);
  w.calcQuote && w.calcQuote();
  const q = getQuote();
  const d = getItemDetail(ch);
  results.push({ case:"J: หลังคาโพลีตัน แปคู่+รางน้ำ+เพลท+เหล็กดึง+ท่อPVCดำ (ใบเฟริล)", sell:d.sell, msgs:d.det, quote:q.substring(0,900) });
}

const realErrs = errs.filter(e => !/Not implemented:|scrollTo/.test(e));
console.log(JSON.stringify({ results, errs: realErrs }, null, 2));
