// Functional test: พิสูจน์ว่าใบเสนอราคา R3.9 "ตรงรูปแบบใบจริง" + ไม่มีบั๊ก format
// โหลด public/calculator/index.html ใน jsdom แล้วสร้างสถานการณ์เหมือนใบจริง (ชุดหลายบาน)
// ตรวจ T1 dedup วัสดุ / T2 ยอดรวม / T3 แยกราคาเฉพาะชุด / T4 โครงสร้างใบ
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../public/calculator/index.html", import.meta.url), "utf8");

const vc = new VirtualConsole();
const errors = [];
vc.on("jsdomError", (e) => errors.push(e.message));

const dom = new JSDOM(html, {
  runScripts: "dangerously",
  resources: undefined,
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
const checks = [];
const want = (name, ok, detail) => checks.push({ name, ok: !!ok, detail: detail || "" });

function setField(ch, sel, value) {
  const el = ch.querySelector(sel);
  if (!el) throw new Error("ไม่พบ field " + sel);
  el.value = String(value);
  el.dispatchEvent(new w.Event("input", { bubbles: true }));
  el.dispatchEvent(new w.Event("change", { bubbles: true }));
  return el;
}

// ดึง "ข้อความ" จาก element อย่างเชื่อถือได้ใน jsdom (innerText ไม่คำนวณ layout → ว่าง)
// ใช้ textContent + ยุบช่องว่าง; เก็บ innerHTML ไว้เทียบ markup ด้วย
function visibleText(el) {
  return (el.textContent || "").replace(/ /g, " ").replace(/\s+/g, " ").trim();
}

// อ่านค่า "รวมทั้งสิ้น" (grand total) ที่ render จริง → คืนตัวเลข
function readGrandTotal() {
  const g = doc.querySelector("#quoteContent .qtot .g");
  if (!g) return NaN;
  const m = (g.textContent || "").replace(/[^\d]/g, "");
  return m ? parseInt(m, 10) : NaN;
}
// อ่านค่า "ราคารวม" (subtotal บรรทัดแรกใน .qtot)
function readSubtotal() {
  const l = doc.querySelector("#quoteContent .qtot .l");
  if (!l) return NaN;
  const m = (l.textContent || "").replace(/[^\d]/g, "");
  return m ? parseInt(m, 10) : NaN;
}

// นับจำนวนครั้งที่ substring ปรากฏ
function countOccur(haystack, needle) {
  if (!needle) return 0;
  let n = 0, i = 0;
  while ((i = haystack.indexOf(needle, i)) !== -1) { n++; i += needle.length; }
  return n;
}

// ---------- สร้างสถานการณ์: 1 ชุด 3 บาน group เดียวกัน (เหมือนใบคุณปีเตอร์) ----------
// addSet() สร้าง setbox + 1 ส่วน, addItem(set-parts) เพิ่มอีก 2 ส่วน → รวม 3 บาน ใน setbox เดียว
// readItem ให้ groupName = setbox.dataset.sid เมื่อ setbox มี .ch > 1 (auto-group)
doc.getElementById("items").innerHTML = ""; // เคลียร์ของเดิม (ถ้ามี)

const setBox = w.addSet();
const partsContainer = setBox.querySelector(".set-parts");
w.addItem(partsContainer);
w.addItem(partsContainer);

// ตั้งชื่อชุด
const setName = setBox.querySelector(".set-name");
setName.value = "ชุดหน้าต่างห้องนอน";
setName.dispatchEvent(new w.Event("input", { bubbles: true }));

const items = [...setBox.querySelectorAll(".ch")];
want("สร้างได้ 3 บานในชุดเดียว", items.length === 3, "ได้ " + items.length);

const OVERRIDES = [21000, 18000, 28000];
const EXPECT_SUBTOTAL = OVERRIDES.reduce((a, b) => a + b, 0); // 67000
const GLASS_NAME = "กระจกเขียว 6 มม."; // GLASS[0] = default

items.forEach((ch, i) => {
  setField(ch, ".i-group", "1");      // บานกระจก
  setField(ch, ".i-type", "window");  // หน้าต่าง
  setField(ch, ".i-w", "1.8");
  setField(ch, ".i-h", "1.2");
  setField(ch, ".i-glass", "0");      // กระจกเขียว 6 มม. (เหมือนกันทุกบาน)
  setField(ch, ".i-panels", "2");
  setField(ch, ".i-qty", "1");
  setField(ch, ".i-override", OVERRIDES[i]); // ราคากำหนดเอง → เลี่ยงพึ่งสูตร
});

// ปิดบริการเสริมทั้งหมด (svc-*) เพื่อให้ subtotal = ผลรวม override ล้วน (ไม่มีค่าบริการแทรก)
["svc-protect", "svc-lift", "svc-travel", "svc-ship"].forEach((id) => {
  const el = doc.getElementById(id);
  if (el && el.checked) { el.checked = false; el.dispatchEvent(new w.Event("change", { bubbles: true })); }
});
const floorsEl = doc.getElementById("svc-floors");
if (floorsEl) { floorsEl.value = "1"; floorsEl.dispatchEvent(new w.Event("input", { bubbles: true })); }

// trigger คำนวณก่อน gen
w.calcQuote();
w.genQuote();

const qc = doc.getElementById("quoteContent");
const text = visibleText(qc);
const htmlGen = qc.innerHTML;

// ================= T1 — ชุดหลายบาน กระจกเหมือนกัน → วัสดุไม่ซ้ำ =================
const glassCount = countOccur(text, GLASS_NAME);
want("T1.1 กระจก '" + GLASS_NAME + "' ปรากฏ 1 ครั้ง (dedup)", glassCount === 1, "นับได้ " + glassCount);
want("T1.2 มีหัวข้อ 'รายละเอียดงาน'", text.includes("รายละเอียดงาน"));
// ยอดรวมชุด = 67,000 (โหมดรวมราคา → โชว์ในเซลล์ยอดรวม)
want("T1.3 ยอดรวมชุด = 67,000 ปรากฏในใบ", text.includes("67,000"), "หาไม่เจอ 67,000");

// ================= T2 — ยอดรวมท้ายใบถูก =================
// 'ราคารวม' (subtotal) = ผลรวม override = 67,000
const subtotalGen = readSubtotal();
want("T2.1 'ราคารวม' = 67,000 (subtotal = ผลรวม override)", subtotalGen === EXPECT_SUBTOTAL,
  "อ่านได้ " + subtotalGen);
// 'รวมทั้งสิ้น' = subtotal * (1+VAT) ; VAT default 7% → 71,690 (ปิดบริการเสริมแล้ว)
const vatEl = doc.getElementById("vat-pct");
const vatPct = vatEl ? (parseFloat(vatEl.value) || 0) : 7;
const expectGrand = Math.round(EXPECT_SUBTOTAL * (1 + vatPct / 100));
const grandGen = readGrandTotal();
want("T2.2 'รวมทั้งสิ้น' = " + expectGrand.toLocaleString("en-US") + " (subtotal+VAT " + vatPct + "%)",
  text.includes("รวมทั้งสิ้น") && grandGen === expectGrand, "อ่านได้ " + grandGen);

// บันทึก grand total + subtotal ก่อน split เพื่อเทียบใน T3 ว่า "ไม่เปลี่ยน"
const grandBefore = grandGen;
const subtotalBefore = subtotalGen;

// ================= T3 — แยกราคาเฉพาะชุด =================
w.toggleGroupSplit(0); // เรียก genQuote เองภายใน
const text3 = visibleText(qc);

// ราคารายบานต้องปรากฏ
let perItemOk = true, missing = [];
OVERRIDES.forEach((v) => {
  const s = v.toLocaleString("en-US");
  if (!text3.includes(s)) { perItemOk = false; missing.push(s); }
});
want("T3.1 โชว์ราคารายบาน 21,000 / 18,000 / 28,000", perItemOk, missing.length ? ("ขาด " + missing.join(",")) : "");

// เซลล์ยอดรวมของแถวชุด = '—' (ซ่อน) — ตรวจว่ามี em-dash ในตาราง
want("T3.2 เซลล์ยอดรวมชุด = '—' (ซ่อน)", text3.includes("—"));

// ยอดท้ายใบไม่เปลี่ยน
const subtotalAfter = readSubtotal();
const grandAfter = readGrandTotal();
want("T3.3 'ราคารวม' (subtotal) ไม่เปลี่ยน = " + subtotalBefore.toLocaleString("en-US"),
  subtotalAfter === subtotalBefore, "ก่อน " + subtotalBefore + " หลัง " + subtotalAfter);
want("T3.4 'รวมทั้งสิ้น' ไม่เปลี่ยน = " + grandBefore.toLocaleString("en-US"),
  text3.includes("รวมทั้งสิ้น") && grandAfter === grandBefore,
  "ก่อน " + grandBefore + " หลัง " + grandAfter);

// สลับกลับเป็นรวมราคา เพื่อตรวจ T4 ในโหมดปกติ
w.toggleGroupSplit(0);
const text4 = visibleText(doc.getElementById("quoteContent"));

// ================= T4 — โครงสร้างตรงใบจริง =================
const html4 = doc.getElementById("quoteContent").innerHTML;
want("T4.1 ชื่อบริษัท 'เจอาร์'", text4.includes("เจอาร์") || html4.includes("เจอาร์"));
want("T4.2 หัวข้อ 'ใบเสนอราคา'", html4.includes("ใบเสนอราคา"));
// หัวตาราง
const headers = ["รายละเอียด", "จำนวน", "ราคา/หน่วย", "ยอดรวม"];
headers.forEach((h) => want("T4.3 หัวตาราง '" + h + "'", html4.includes(h)));
want("T4.4 'รวมทั้งสิ้น'", text4.includes("รวมทั้งสิ้น"));
// จำนวนเงินตัวอักษร (วงเล็บ + บาท)
const bahtTextOk = /\([^)]*บาท[^)]*\)/.test(text4) || /\([^)]*บาท[^)]*\)/.test(html4);
want("T4.5 จำนวนเงินตัวอักษร '(...บาท...)'", bahtTextOk);
// เลขที่เอกสาร
want("T4.6 มีเลขที่เอกสาร (JR...)", /JR\d/.test(html4) || html4.includes("เลขที่"));
// ลายเซ็น 2 ฝั่ง (ref [ส่วนท้าย])
want("T4.7 ลายเซ็น 'ในนาม บจก. เจอาร์...'", html4.includes("ในนาม"));

// ---------- JS errors ----------
const jsErrs = errors.filter((e) => !/sheetjs|xlsx|Could not load|external|net::|localStorage|scrollTo|Not implemented/i.test(e));
want("ไม่มี JS error ร้ายแรงระหว่างทดสอบ", jsErrs.length === 0, jsErrs.join(" | "));

// ================= รายงานผล =================
let pass = 0;
console.log("=== FUNCTIONAL TEST เครื่องคิดราคา R3.9 (ใบเสนอตรงใบจริง) ===\n");
for (const c of checks) {
  console.log((c.ok ? "PASS " : "FAIL ") + c.name + (c.detail && !c.ok ? "  [" + c.detail + "]" : ""));
  if (c.ok) pass++;
}
console.log(`\nผ่าน ${pass}/${checks.length}`);

// แปะ innerText ใบที่ออกมา (ย่อ) สำหรับ inspect
console.log("\n--- ตัวอย่าง ข้อความใบเสนอ (โหมดรวมราคา, จากแถวรายการ) ---");
{
  const rowsTxt = [...doc.querySelectorAll("#quoteContent table.qt tbody tr")]
    .map(tr => visibleText(tr)).join("\n");
  const totTxt = [...doc.querySelectorAll("#quoteContent .qtot .l, #quoteContent .qtot .g, #quoteContent .qsubtotal")]
    .map(d => visibleText(d)).join("\n");
  console.log(rowsTxt + "\n" + totTxt);
}

if (jsErrs.length) console.log("\nJS errors:\n" + jsErrs.join("\n"));

process.exit(pass === checks.length ? 0 : 1);
