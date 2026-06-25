// gen-summary-report.mjs — render ใบเสนอราคาจริงทุกกลุ่ม + ประกอบรายงาน HTML สรุปงาน dev 17 มิ.ย.
// READ-ONLY: ไม่แก้ index.html · เขียนได้แค่ docs/ และ scripts/
// ใช้: node scripts/gen-summary-report.mjs
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DOCS = join(ROOT, "docs");
const OUT_HTML = join(DOCS, "สรุปงาน-dev-2026-06-17.html");

// ===== boot jsdom =====
console.log("[boot] กำลังโหลด index.html …");
const htmlSrc = readFileSync(join(ROOT, "public/calculator/index.html"), "utf8");
const vc = new VirtualConsole();
const jsErrors = [];
vc.on("jsdomError", (e) => {
  if (!/scrollTo|Not implemented/i.test(e.message)) jsErrors.push(e.message);
});
const dom = new JSDOM(htmlSrc, {
  runScripts: "dangerously",
  pretendToBeVisual: true,
  virtualConsole: vc,
  url: "http://localhost/calculator/index.html",
});
await new Promise((r) => {
  if (dom.window.document.readyState === "complete") r();
  else dom.window.addEventListener("load", r);
  setTimeout(r, 3000);
});
const w = dom.window;
const doc = w.document;
console.log("[boot] โหลดเสร็จ");

// ===== helpers =====
const fire = (el, t) => el.dispatchEvent(new w.Event(t, { bubbles: true }));

const noSvc = () =>
  ["svc-protect", "svc-lift", "svc-travel", "svc-ship"].forEach((id) => {
    const e = doc.getElementById(id);
    if (e && e.checked) { e.checked = false; fire(e, "change"); }
  });

function resetItems() {
  doc.getElementById("items").innerHTML = "";
  try { w.addItem(doc.getElementById("items")); } catch (e) { return false; }
  return true;
}

function getCard() {
  return doc.querySelector("#items .ch");
}

function setGroup(ch, g) {
  const gs = ch.querySelector(".i-group");
  if (!gs) return false;
  gs.value = String(g);
  fire(gs, "change");
  return true;
}

function setProd(ch, id) {
  const ps = ch.querySelector(".i-prod");
  if (!ps) return false;
  if (!ps.querySelector(`option[value="${id}"]`)) return false;
  ps.value = id;
  fire(ps, "change");
  return true;
}

function setWH(ch, w2, h) {
  const wi = ch.querySelector(".i-w");
  const hi = ch.querySelector(".i-h");
  if (wi) { wi.value = String(w2); fire(wi, "input"); fire(wi, "change"); }
  if (hi) { hi.value = String(h); fire(hi, "input"); fire(hi, "change"); }
}

function setOpt(ch, cls, val) {
  const sel = cls.startsWith(".") ? cls : "." + cls;
  const el = ch.querySelector(sel);
  if (!el) return false;
  if (el.type === "checkbox") {
    el.checked = val === true || val === "1" || val === true;
  } else {
    el.value = String(val);
  }
  fire(el, "input");
  fire(el, "change");
  return true;
}

function setColor(ch, val) {
  const el = ch.querySelector(".i-color");
  if (!el) return false;
  el.value = String(val);
  fire(el, "change");
  return true;
}

function setGlass(ch, val) {
  const el = ch.querySelector(".i-glass");
  if (!el) return false;
  el.value = String(val);
  fire(el, "change");
  return true;
}

function genQuoteHTML() {
  try {
    w.calcQuote && w.calcQuote();
    w.genQuote && w.genQuote();
  } catch (e) {
    return { html: "", err: e.message };
  }
  const qc = doc.getElementById("quoteContent");
  if (!qc) return { html: "", err: "ไม่พบ #quoteContent" };
  const h = qc.innerHTML || "";
  return { html: h.trim(), err: h.trim() ? "" : "quoteContent ว่าง" };
}

// ===== render แต่ละกลุ่ม =====
const results = [];

// ---------- G1: งานบาน · sliding_sms · 1.8×2.0 · สีอบขาว + กระจกใส5 + มุ้งเฟรมเล็ก ----------
console.log("[G1] render งานบาน sliding_sms …");
try {
  resetItems();
  const ch = getCard();
  if (!ch) throw new Error("ไม่ได้ card หลัง addItem");
  setGroup(ch, "1");
  if (!setProd(ch, "sliding_sms")) throw new Error("เลือก sliding_sms ไม่ได้");
  setWH(ch, 1.8, 2.0);
  // สีอบขาว = index 0 (default)
  setColor(ch, "0");
  // กระจกใส 5มม = index 1 (ขึ้นกับ colorOpts · ลอง 1)
  setGlass(ch, "1");
  // มุ้งเฟรมเล็ก
  setOpt(ch, ".o-mosq", "imp21");
  noSvc();
  const { html, err } = genQuoteHTML();
  results.push({
    gid: "G1",
    label: "G1 งานบาน — บานเลื่อน เซมิยูโร (SMS)",
    desc: "ใบเสร็จ 5 บล็อก: หัวใบ · รายการ(ชื่อ+ขนาด) · รายละเอียดสเปก · ตัวเลขราคา · หมายเหตุ",
    sampleInfo: "sliding_sms 1.8×2.0 ม. สีอบขาว + กระจกใส5มม + มุ้งเฟรมเล็ก",
    html,
    err,
  });
  console.log(`  ${err ? "ERR: " + err : "OK · " + html.length + " chars"}`);
} catch (e) {
  results.push({ gid: "G1", label: "G1 งานบาน", sampleInfo: "", html: "", err: e.message });
  console.log(`  ERR: ${e.message}`);
}

// ---------- G2a: ประตูรั้ว fence_gate + รางโค้ง + มอเตอร์2 + ลายไม้ทอง ----------
console.log("[G2a] render ประตูรั้ว fence_gate …");
try {
  resetItems();
  const ch = getCard();
  if (!ch) throw new Error("ไม่ได้ card");
  setGroup(ch, "2");
  if (!setProd(ch, "fence_gate")) throw new Error("เลือก fence_gate ไม่ได้");
  setWH(ch, 3.0, 2.0);
  setOpt(ch, ".o-railtype", "curved");
  setOpt(ch, ".o-gmotor", "2");
  // gatewood/ลายไม้ — ลอง o-gatewood ถ้ามี
  const gwEl = ch.querySelector(".o-gatewood");
  if (gwEl) { gwEl.value = "15000"; fire(gwEl, "input"); fire(gwEl, "change"); }
  setOpt(ch, ".o-gfin", "อบสีพิเศษ");
  noSvc();
  const { html, err } = genQuoteHTML();
  results.push({
    gid: "G2a",
    label: "G2 ประตูรั้ว — fence_gate รางโค้ง มอเตอร์2 อบสีพิเศษ",
    desc: "เห็นบล็อก OPTION ลายไม้ขึ้นแถวแยก (สีแดง) + รายละเอียดราง/มอเตอร์",
    sampleInfo: "fence_gate 3.0×2.0 ม. ราง=curved มอเตอร์=2 อบสีพิเศษ",
    html,
    err,
  });
  console.log(`  ${err ? "ERR: " + err : "OK · " + html.length + " chars"}`);
} catch (e) {
  results.push({ gid: "G2a", label: "G2 ประตูรั้ว", sampleInfo: "", html: "", err: e.message });
  console.log(`  ERR: ${e.message}`);
}

// ---------- G2b: ระแนงบังตา rn2 + ราวกันตก imp3 (2 รายการ · แยกบล็อก) ----------
console.log("[G2b] render ระแนง rn2 + ราวกันตก imp3 …");
try {
  // รายการที่ 1: rn2
  resetItems();
  const ch1 = getCard();
  if (!ch1) throw new Error("ไม่ได้ card 1");
  setGroup(ch1, "2");
  if (!setProd(ch1, "rn2")) throw new Error("เลือก rn2 ไม่ได้");
  setWH(ch1, 3.0, 2.5);
  setOpt(ch1, ".o-finish", "อบสีพิเศษ");

  // รายการที่ 2: เพิ่มอีกหนึ่ง item
  try { w.addItem(doc.getElementById("items")); } catch (e2) { /* ข้าม */ }
  const cards = doc.querySelectorAll("#items .ch");
  const ch2 = cards[1];
  if (ch2) {
    setGroup(ch2, "2");
    if (setProd(ch2, "imp3")) {
      setWH(ch2, 4.0, 1.1);
      setOpt(ch2, ".o-railalucolor", "สีดำ");
    }
  }

  noSvc();
  const { html, err } = genQuoteHTML();
  results.push({
    gid: "G2b",
    label: "G2 ระแนง+ราวกันตก — rn2 + imp3 (2 รายการ)",
    desc: "เห็นใบแยกบล็อกตามรายการ: ระแนงบังตา / ราวกันตกกระจก (สีดำ) ขึ้นรายละเอียดแยก",
    sampleInfo: "rn2 3.0×2.5 ม. + imp3 4.0×1.1 ม. สีดำ",
    html,
    err,
  });
  console.log(`  ${err ? "ERR: " + err : "OK · " + html.length + " chars"}`);
} catch (e) {
  results.push({ gid: "G2b", label: "G2 ระแนง+ราวกันตก", sampleInfo: "", html: "", err: e.message });
  console.log(`  ERR: ${e.message}`);
}

// ---------- G3: หลังคา roof_vinyl + ฝ้า ceil_cshape ----------
console.log("[G3] render หลังคา roof_vinyl + ฝ้า …");
try {
  resetItems();
  const ch = getCard();
  if (!ch) throw new Error("ไม่ได้ card");
  setGroup(ch, "3");
  // กลุ่ม 3: .i-prod มี option roof_vinyl อยู่แล้ว (อยู่ใน prodOptionsG6 ของกลุ่ม 3)
  // setProd ก่อน ถ้าไม่ได้ลอง g3SyncProd (function ใน index.html)
  if (!setProd(ch, "roof_vinyl")) {
    // fallback: เรียก g3SyncProd โดยตรง
    try { w.g3SyncProd && w.g3SyncProd(ch, "roof_vinyl"); } catch (e3) { /* ข้าม */ }
  }
  setWH(ch, 4.0, 3.0);
  // สี
  const rc = ch.querySelector(".o-roofcolor");
  if (rc) { rc.value = rc.options[0] ? rc.options[0].value : ""; fire(rc, "change"); }
  // เพิ่มฝ้า (ถ้าทำได้ผ่าน o-ceiltype)
  const ct = ch.querySelector(".o-ceiltype");
  if (ct) { ct.value = "ceil_cshape"; fire(ct, "change"); }
  noSvc();
  const { html, err } = genQuoteHTML();
  results.push({
    gid: "G3",
    label: "G3 หลังคา/ฝ้า — หลังคาไวนิล 4×3 ม. + ฝ้าอลู",
    desc: "เห็นบล็อกหลังคา + ถ้ามีฝ้าออปชั่น ขึ้นบล็อกย่อย · ราคาแยกชัดเจน",
    sampleInfo: "roof_vinyl 4.0×3.0 ม. + ceil_cshape (ออปชั่น)",
    html,
    err,
  });
  console.log(`  ${err ? "ERR: " + err : "OK · " + html.length + " chars"}`);
} catch (e) {
  results.push({ gid: "G3", label: "G3 หลังคา/ฝ้า", sampleInfo: "", html: "", err: e.message });
  console.log(`  ERR: ${e.message}`);
}

// ---------- G4: ตู้อลู cabinet_alu ----------
console.log("[G4] render ตู้อลู cabinet_alu …");
try {
  resetItems();
  const ch = getCard();
  if (!ch) throw new Error("ไม่ได้ card");
  setGroup(ch, "4");
  if (!setProd(ch, "cabinet_alu")) throw new Error("เลือก cabinet_alu ไม่ได้");
  setWH(ch, 1.8, 2.4);
  setColor(ch, "0"); // สีอบขาว
  // ตู้เสื้อผ้า
  const ct = ch.querySelector(".o-cabtype");
  if (ct) { ct.value = "wardrobe"; fire(ct, "change"); }
  // จำนวนประตู
  const cd = ch.querySelector(".o-cabdoors");
  if (cd) { cd.value = "2"; fire(cd, "change"); }
  noSvc();
  const { html, err } = genQuoteHTML();
  results.push({
    gid: "G4",
    label: "G4 ตู้อลู — ตู้อลูมิเนียม 1.8×2.4 ม. 2 บาน",
    desc: "เห็น 5 บล็อก: ชื่อตู้ / ขนาด+จำนวนบาน / ลักษณะ / สี / ราคา",
    sampleInfo: "cabinet_alu 1.8×2.4 ม. ตู้เสื้อผ้า 2 บาน สีอบขาว",
    html,
    err,
  });
  console.log(`  ${err ? "ERR: " + err : "OK · " + html.length + " chars"}`);
} catch (e) {
  results.push({ gid: "G4", label: "G4 ตู้อลู", sampleInfo: "", html: "", err: e.message });
  console.log(`  ERR: ${e.message}`);
}

// ---------- G5: มุ้ง imp21 เฟรมเล็ก + ผ้ากันแมว + สีกรอบ ----------
console.log("[G5] render มุ้ง imp21 …");
try {
  resetItems();
  const ch = getCard();
  if (!ch) throw new Error("ไม่ได้ card");
  setGroup(ch, "5");
  if (!setProd(ch, "imp21")) throw new Error("เลือก imp21 ไม่ได้");
  setWH(ch, 1.0, 2.0);
  // ผ้ากันแมว
  setOpt(ch, ".o-screenfabric", "cat");
  // สีกรอบ (ถ้ามี o-mscolor)
  const msc = ch.querySelector(".o-mscolor");
  if (msc && msc.options.length > 2) {
    msc.value = msc.options[2].value; fire(msc, "change");
  }
  noSvc();
  const { html, err } = genQuoteHTML();
  results.push({
    gid: "G5",
    label: "G5 มุ้ง — มุ้งเฟรมเล็ก imp21 ผ้ากันแมว",
    desc: "เห็นบล็อกมุ้ง: ชื่อ+ขนาด / ผ้ามุ้งชนิด / สีกรอบ / ราคาต่อบาน (engine คิดต่อบาน 17มิ.ย.)",
    sampleInfo: "imp21 1.0×2.0 ม. ผ้ากันแมว สีกรอบพิเศษ",
    html,
    err,
  });
  console.log(`  ${err ? "ERR: " + err : "OK · " + html.length + " chars"}`);
} catch (e) {
  results.push({ gid: "G5", label: "G5 มุ้ง", sampleInfo: "", html: "", err: e.message });
  console.log(`  ERR: ${e.message}`);
}

// ===== ประกอบรายงาน HTML =====
console.log("[html] ประกอบรายงาน …");

const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ตาราง Part A
const tableA = `
<table class="tbl-a">
<thead>
<tr>
  <th>#</th>
  <th>โซน</th>
  <th>งาน</th>
  <th>Commit</th>
  <th>สถานะ</th>
</tr>
</thead>
<tbody>
  <tr class="ok">
    <td>1</td>
    <td>หมายเหตุ</td>
    <td>หมายเหตุติ๊กหลายข้อ + ข้อความ 12+9+4 + นั่งร้าน 2 แถว</td>
    <td><code>0c86e73</code></td>
    <td class="st-ok">✅ เข้าเว็บ</td>
  </tr>
  <tr class="ok">
    <td>2</td>
    <td>ราคา/สเปก</td>
    <td>7 ข้อ ส่วน B (ปลั๊ก 1,000 · ไฟขั้นต่ำ 3,000 · โซ่ลายโลตัส · ท่อ PVC สี · ชินโคไลท์สีครบ · ดีไลท์ DG7 · ผนังเบาสเปกเต็ม)</td>
    <td><code>63fabcf</code></td>
    <td class="st-ok">✅ เข้าเว็บ</td>
  </tr>
  <tr class="ok">
    <td>3</td>
    <td>ใบ 5 บล็อก · G2</td>
    <td>4 ปุ่ม + ไอคอน 📕📘🛡⚙ + ใบ 5 บล็อก (รั้ว/ระแนง/ราว)</td>
    <td><code>a6d754b</code></td>
    <td class="st-ok">✅ เข้าเว็บ</td>
  </tr>
  <tr class="warn">
    <td>4</td>
    <td>ใบ 5 บล็อก · G2</td>
    <td>OPTION ลายไม้ Golden Teak → บล็อก OPTION (หัวแดง)</td>
    <td><code>patch (option-redblock)</code></td>
    <td class="st-warn">🟡 รอ apply</td>
  </tr>
  <tr class="ok">
    <td>5</td>
    <td>ใบ 5 บล็อก · G3</td>
    <td>ใบ 5 บล็อก หลังคา + ฝ้า/ผนัง</td>
    <td><code>53a7f0e</code></td>
    <td class="st-ok">✅ เข้าเว็บ</td>
  </tr>
  <tr class="ok">
    <td>6</td>
    <td>ใบ 5 บล็อก · G5</td>
    <td>engine คิดต่อบาน + ป้ายกันแมว + ใบ 5 บล็อก (มุ้ง)</td>
    <td><code>b3d9c98</code></td>
    <td class="st-ok">✅ เข้าเว็บ</td>
  </tr>
  <tr class="ok">
    <td>7</td>
    <td>ใบ 5 บล็อก · G1</td>
    <td>ใบ 5 บล็อก งานบาน</td>
    <td><code>00e2c6a</code></td>
    <td class="st-ok">✅ เข้าเว็บ</td>
  </tr>
  <tr class="ok">
    <td>8</td>
    <td>ใบ 5 บล็อก · G4</td>
    <td>ใบ 5 บล็อก ตู้อลู</td>
    <td><em>(เดิม)</em></td>
    <td class="st-ok">✅ เข้าเว็บ</td>
  </tr>
  <tr class="pend">
    <td>9</td>
    <td>ใบ 5 บล็อก · G7</td>
    <td>ใบ 5 บล็อก ม่านซิป</td>
    <td>—</td>
    <td class="st-red">🔴 ค้าง</td>
  </tr>
  <tr class="pend">
    <td>10</td>
    <td>ปุ่ม label</td>
    <td>จัดชื่อปุ่มให้สวย/สม่ำเสมอ ทุก G</td>
    <td>—</td>
    <td class="st-red">🔴 ค้าง</td>
  </tr>
</tbody>
</table>
`;

// Build Part B (ใบจริง)
function quoteSection(r) {
  const title = esc(r.label);
  const desc = esc(r.desc);
  const info = esc(r.sampleInfo);

  let body;
  if (r.err && !r.html) {
    body = `<div class="render-err">⚠ render ไม่ได้: ${esc(r.err)}</div>`;
  } else if (!r.html) {
    body = `<div class="render-err">⚠ ใบว่าง (quoteContent ว่าง)</div>`;
  } else {
    body = `<div class="quote-embed">${r.html}</div>`;
    if (r.err) {
      body = `<div class="render-warn">⚠ ${esc(r.err)}</div>` + body;
    }
  }

  return `
<div class="grp-section">
  <h3 class="grp-title">${title}</h3>
  <p class="grp-desc">${desc}</p>
  <p class="grp-info">ตัวอย่าง: ${info}</p>
  ${body}
</div>`;
}

const partB = results.map(quoteSection).join("\n");

// Part C — งานค้าง
const partC = `
<ul class="backlog">
  <li class="bl-warn">🟡 <strong>G2 OPTION แดง</strong> — patch พร้อมแล้ว รอ apply<br>
    <code>docs/กลุ่ม2-รั้วระแนงราวกันตก/HANDOFF-G2-option-redblock-2026-06-17.md</code></li>
  <li class="bl-red">🔴 <strong>G7 ม่านซิป ใบ 5 บล็อก</strong> — ยังไม่ได้ทำ</li>
  <li class="bl-red">🔴 <strong>ปุ่ม label จัดสวย ทุก G</strong> — ยังไม่ได้ทำ<br>
    <code>docs/HANDOFF-ปุ่ม-label-จัดสวย-2026-06-17.md</code></li>
  <li class="bl-red">🔴 <strong>Region 2 ข้อที่เหลือ</strong> — ตรวจ HANDOFF-ใบเสนอราคา-ข้อความ+สเปก ส่วน B ว่าครบ 9 ข้อยัง (ธรณีบานเปิด 4 ตัวเลือก ฯลฯ)<br>
    <code>docs/HANDOFF-ใบเสนอราคา-ข้อความ+สเปก-2026-06-17.md</code></li>
</ul>
`;

// Render summary
const renderLog = results.map(r => {
  const icon = (!r.html && r.err) ? "🔴" : r.err ? "🟡" : "🟢";
  return `<tr>
    <td>${esc(r.gid)}</td>
    <td>${icon}</td>
    <td>${r.html ? r.html.length + " chars" : "—"}</td>
    <td>${esc(r.err || "สำเร็จ")}</td>
  </tr>`;
}).join("\n");

// ===== assemble HTML =====
const reportDate = "17 มิถุนายน 2569";
const htmlOut = `<!doctype html>
<html lang="th">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>สรุปงาน dev — 17 มิ.ย. 2569 | JR OMS</title>
<style>
/* ===== reset + base ===== */
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent;}
body{
  margin:0;padding:20px 16px 60px;
  font-family:"Sarabun","Leelawadee UI","Noto Sans Thai","Segoe UI",Tahoma,sans-serif;
  font-size:14px;line-height:1.6;color:#1f2937;background:#f8f9fa;
}
.wrap{max-width:900px;margin:0 auto;}
h1{font-size:22px;color:#B3151D;border-bottom:3px solid #B3151D;padding-bottom:8px;margin-bottom:6px;}
h2{font-size:17px;color:#7A1015;margin-top:28px;padding-bottom:4px;border-bottom:1px solid #e5e7eb;}
h3.grp-title{font-size:15px;color:#185FA5;margin:0 0 4px;}
.meta{color:#6b7280;font-size:12px;margin-bottom:20px;}
code{background:#f3f4f6;padding:1px 5px;border-radius:3px;font-size:12px;font-family:monospace;}

/* ===== legend ===== */
.legend{display:flex;gap:12px;flex-wrap:wrap;margin:10px 0 16px;font-size:13px;}
.leg{padding:4px 12px;border-radius:12px;font-weight:600;}
.leg-ok{background:#dcfce7;color:#166534;}
.leg-warn{background:#fef9c3;color:#854d0e;}
.leg-red{background:#fee2e2;color:#991b1b;}

/* ===== table part A ===== */
.tbl-a{width:100%;border-collapse:collapse;background:#fff;font-size:13px;margin-top:10px;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);}
.tbl-a th{background:#fbe9ea;color:#B3151D;font-weight:700;padding:9px 10px;text-align:left;border-bottom:2px solid #e5e7eb;}
.tbl-a td{padding:8px 10px;border-bottom:1px solid #f3f4f6;vertical-align:top;}
.tbl-a tr.ok td{background:#fff;}
.tbl-a tr.warn td{background:#fefce8;}
.tbl-a tr.pend td{background:#fef2f2;}
.st-ok{color:#166534;font-weight:700;white-space:nowrap;}
.st-warn{color:#854d0e;font-weight:700;white-space:nowrap;}
.st-red{color:#991b1b;font-weight:700;white-space:nowrap;}

/* ===== grp sections ===== */
.grp-section{
  margin:16px 0;padding:14px;
  background:#fff;border:1px solid #e5e7eb;border-radius:10px;
  box-shadow:0 1px 3px rgba(0,0,0,.06);
}
.grp-desc{font-size:12.5px;color:#374151;margin:0 0 4px;}
.grp-info{font-size:11.5px;color:#6b7280;margin:0 0 10px;font-style:italic;}

/* ===== embed ใบจริง ===== */
.quote-embed{
  border:1.5px solid #D1D5DB;border-radius:8px;padding:12px;
  overflow-x:auto;background:#fff;
  font-family:"Sarabun","Leelawadee UI","Noto Sans Thai",Tahoma,sans-serif;
  font-size:12.5px;
}
/* ยืมสไตล์ใบจริงจาก index.html */
.quote-embed table{width:100%;border-collapse:collapse;}
.quote-embed th,.quote-embed td{padding:6px 8px;border:1px solid #e5e7eb;text-align:left;vertical-align:top;}
.quote-embed th{background:#fbe9ea;color:#B3151D;font-weight:700;}
.quote-embed .qtbl-head td,.quote-embed .qtbl-head th{background:#B3151D;color:#fff;}
.quote-embed .q-block-opt td{background:#FFF0F0;border-left:3px solid #B3151D;}
.quote-embed .q-block-det td{background:#F0F7FF;border-left:3px solid #185FA5;}
.quote-embed .qtot td{background:#B3151D;color:#fff;font-weight:700;font-size:14px;}
.quote-embed .qtot-sub td{background:#fbe9ea;color:#7A1015;font-weight:600;}
.quote-embed .q-remark td{background:#f9fafb;color:#374151;font-size:12px;}

.render-err{
  background:#fee2e2;color:#991b1b;padding:10px 14px;border-radius:6px;
  font-weight:600;font-size:13px;
}
.render-warn{
  background:#fef9c3;color:#854d0e;padding:8px 12px;border-radius:6px;
  font-size:12.5px;margin-bottom:6px;
}

/* ===== backlog ===== */
.backlog{list-style:none;padding:0;margin:0;}
.backlog li{
  padding:10px 14px;margin-bottom:8px;border-radius:8px;
  background:#fff;border:1px solid #e5e7eb;
}
.bl-warn{border-left:4px solid #F59E0B;}
.bl-red{border-left:4px solid #EF4444;}

/* ===== render log ===== */
.tbl-log{width:100%;border-collapse:collapse;font-size:12px;background:#fff;margin-top:8px;}
.tbl-log th{background:#f3f4f6;padding:7px 10px;border:1px solid #e5e7eb;text-align:left;}
.tbl-log td{padding:6px 10px;border:1px solid #e5e7eb;vertical-align:top;}

@media print{
  body{background:#fff;padding:10px;}
  .grp-section{break-inside:avoid;}
  .quote-embed{overflow:visible;}
}
</style>
</head>
<body>
<div class="wrap">

<h1>สรุปงาน dev — ${reportDate}</h1>
<p class="meta">สร้างโดย gen-summary-report.mjs · ${new Date().toLocaleString("th-TH")} · ใบเสนอราคา render จาก engine จริง (jsdom + index.html)</p>

<div class="legend">
  <span class="leg leg-ok">✅ เสร็จ/เข้าเว็บ</span>
  <span class="leg leg-warn">🟡 รอ apply / รอตรวจ</span>
  <span class="leg leg-red">🔴 ยังไม่ทำ / ค้าง</span>
</div>

<!-- ===== Part A ===== -->
<h2>ส่วน A — ตารางงานที่สั่งแก้ 17 มิ.ย.</h2>
${tableA}

<!-- ===== Part B ===== -->
<h2>ส่วน B — ใบเสนอราคาจริงที่ render จาก engine</h2>
<p style="font-size:12.5px;color:#6b7280;">ใบด้านล่างนี้ render จาก <code>public/calculator/index.html</code> ผ่าน jsdom จริง ไม่ใช่วาดมือ · ดูว่า 5 บล็อก (หัวใบ / รายการ / รายละเอียด / ราคา / หมายเหตุ) แยกชัดไหม</p>
${partB}

<!-- ===== Part C ===== -->
<h2>ส่วน C — งานค้างทำต่อ</h2>
${partC}

<!-- ===== render log ===== -->
<h2>Log การ Render ใบ (สรุป)</h2>
<table class="tbl-log">
<thead><tr><th>กลุ่ม</th><th>ผล</th><th>ขนาด HTML</th><th>หมายเหตุ</th></tr></thead>
<tbody>${renderLog}</tbody>
</table>

<p style="margin-top:20px;font-size:11.5px;color:#9ca3af;">
  <strong>JS errors ตอน boot:</strong> ${jsErrors.length === 0 ? "ไม่มี" : esc(jsErrors.slice(0, 5).join(" | "))}
</p>

</div>
</body>
</html>`;

writeFileSync(OUT_HTML, htmlOut, "utf8");
console.log(`\n[done] HTML → ${OUT_HTML}`);
console.log(`[render summary]`);
results.forEach(r => {
  const icon = (!r.html && r.err) ? "🔴" : r.err ? "🟡" : "🟢";
  console.log(`  ${icon} ${r.gid}: ${r.html ? r.html.length + " chars" : "ว่าง"} ${r.err ? "/ " + r.err : ""}`);
});
if (jsErrors.length) console.log(`  JS errors: ${jsErrors.slice(0, 3).join(" | ")}`);
