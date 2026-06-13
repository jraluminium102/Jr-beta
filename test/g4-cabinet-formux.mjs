// SPEC-G4 (formux + categories) verify — ตู้อลู/ฝาตู้: ชิป + หมวด 📦 + ตัด 3 ออปชั่น + regression G1/G3
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../public/calculator/index.html", import.meta.url), "utf8");
const vc = new VirtualConsole();
const errors = [];
vc.on("jsdomError", (e) => { if (!/Not implemented:|scrollIntoView|scrollTo/.test(e.message)) errors.push(e.message); });
const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc, url: "http://localhost/calculator/index.html" });
await new Promise((r) => { if (dom.window.document.readyState === "complete") r(); else dom.window.addEventListener("load", r); setTimeout(r, 1500); });
const w = dom.window, doc = w.document;

const checks = [];
const want = (n, ok, d) => checks.push({ n, ok: !!ok, d: d || "" });
function sf(ch, sel, v) { const e = ch.querySelector(sel); if (!e) throw new Error("no " + sel); e.value = String(v); e.dispatchEvent(new w.Event("input", { bubbles: true })); e.dispatchEvent(new w.Event("change", { bubbles: true })); return e; }
function add(group, prod) { w.addItem(); const chs = doc.querySelectorAll("#items .ch"); const d = chs[chs.length - 1]; sf(d, ".i-group", group); sf(d, ".i-prod", prod); return d; }
function boxNames(d) { return [].map.call(d.querySelectorAll(".i-opts .gh-opt-cat-det > summary"), (s) => s.textContent.replace(/\s*\(\d+\)\s*$/, "")); }
function boxOf(d, kw) { var det = [].find.call(d.querySelectorAll(".i-opts .gh-opt-cat-det"), (x) => kw.test(x.querySelector("summary").textContent)); return det; }

// ===== ตู้อลู =====
const dc = add("4", "cabinet_alu");
const names = boxNames(dc);
want("ตู้: มีหมวด 📦 รายละเอียดตู้", names.some((x) => /รายละเอียดตู้/.test(x)), names.join(" | "));
want("ตู้: 📦 อยู่บนสุด", /รายละเอียดตู้/.test(names[0]), names[0]);
// 3 ชิป
want("ตู้: ชิปประเภทตู้ (2)", dc.querySelectorAll('.chip[onclick*="o-cabtype"]').length === 2);
want("ตู้: ชิปจำนวนบาน (3)", dc.querySelectorAll('.chip[onclick*="o-cabdoors"]').length === 3);
want("ตู้: ชิปชนิดชั้น (3)", dc.querySelectorAll('.chip[onclick*="o-shelfmat"]').length === 3);
// 6 ช่องอยู่ใน �็ box
const pkg = boxOf(dc, /รายละเอียดตู้/);
const pkgText = pkg ? pkg.textContent : "";
want("ตู้: 6 ช่องอยู่ในกล่อง 📦", /ประเภทตู้/.test(pkgText) && /จำนวนบานหน้าตู้/.test(pkgText) && /ชนิดชั้น/.test(pkgText) && /ลึก/.test(pkgText) && /จำนวนชั้น/.test(pkgText) && /ผนังหลัง/.test(pkgText));
// label ประเภทตู้ (ไม่ใช่ "ประเภท" เปล่า)
want("ตู้: label = 'ประเภทตู้'", /ประเภทตู้/.test(pkgText));
// ตัด 3 ออปชั่น
want("ตู้: ไม่มี ฝังรางยู", !dc.querySelector(".o-uchannel"));
want("ตู้: ไม่มี ดรอปพื้น", !dc.querySelector(".o-dfm"));
const itw = dc.querySelector(".i-type") && dc.querySelector(".i-type").closest(".full");
want("ตู้: ซ่อน .i-type", itw && itw.style.display === "none");
// หมายเหตุ: ตู้อลูเป็น areaOnly → ไม่มีครอบวงกบมาแต่เดิม (ไม่เกี่ยวกับงานนี้)

// cabtype chip → listener auto สูง/ลึก
dc.querySelector('.chip[onclick*="o-cabtype"][data-val="shoe"]').click();
want("ตู้: กดตู้รองเท้า → สูง=2.0 ลึก=0.4 (listener)", dc.querySelector(".i-h").value == "2" && dc.querySelector(".o-depth").value == "0.4", "h=" + dc.querySelector(".i-h").value + " d=" + dc.querySelector(".o-depth").value);
dc.querySelector('.chip[onclick*="o-cabtype"][data-val="wardrobe"]').click();
want("ตู้: กดตู้ทั่วไป → สูง=2.4 ลึก=0.6", dc.querySelector(".i-h").value == "2.4" && dc.querySelector(".o-depth").value == "0.6", "h=" + dc.querySelector(".i-h").value + " d=" + dc.querySelector(".o-depth").value);
// readItem อ่าน value เดิม
sf(dc, ".i-w", "1.2"); sf(dc, ".i-h", "2.4");
const sell0 = w.readItem(dc).r.sell; // default ตามประเภท (wardrobe→alu)
dc.querySelector('.chip[onclick*="o-shelfmat"][data-val="glass"]').click();
want("ตู้: readItem shelfmat=glass", w.readItem(dc).optSel.shelfmat === "glass");
want("ตู้: เปลี่ยนชนิดชั้น (glass) → ราคาเปลี่ยน", w.readItem(dc).r.sell !== sell0, "default=" + sell0 + " glass=" + w.readItem(dc).r.sell);
dc.querySelector('.chip[onclick*="o-cabdoors"][data-val="3"]').click();
want("ตู้: readItem cabDoors=3", w.readItem(dc).optSel.cabDoors === "3");

// ===== ฝาตู้ =====
const df = add("4", "future_tech");
want("ฝาตู้: สีฝาตู้ คงดรอปดาวน์ (≥12 option)", df.querySelectorAll(".o-ftcolor option").length >= 12, "n=" + df.querySelectorAll(".o-ftcolor option").length);
want("ฝาตู้: สีฝาตู้อยู่ในกล่อง 📦", boxOf(df, /รายละเอียดตู้/) && /สีฝาตู้/.test(boxOf(df, /รายละเอียดตู้/).textContent));
want("ฝาตู้: ไม่มี ฝังรางยู/ดรอปพื้น", !df.querySelector(".o-uchannel") && !df.querySelector(".o-dfm"));
const itwF = df.querySelector(".i-type") && df.querySelector(".i-type").closest(".full");
want("ฝาตู้: ซ่อน .i-type", itwF && itwF.style.display === "none");

// ===== Regression G1 บานเลื่อน =====
const dg1 = add("1", "sliding_euro");
const g1names = boxNames(dg1);
want("G1: ไม่มีหมวด 📦 รายละเอียดตู้", !g1names.some((x) => /รายละเอียดตู้/.test(x)), g1names.join(" | "));
// G1G6-D (2026-06-13): 🚪 ชนิด/การเปิด ถูกจัดใหม่เป็น 7 หมวด — เช็คหมวด ① ธรณี/ครอบวงกบ แทน
const g1kua = boxOf(dg1, /ธรณี/);
want("G1: หมวด ① ธรณี/ครอบวงกบ แสดงปกติ (7 หมวดใหม่)", !!g1kua && g1kua.textContent.length > 10, g1kua ? "ok" : "no ① box");
want("G1: ยังมี ฝังรางยู + ดรอปพื้น", !!dg1.querySelector(".o-uchannel") && !!dg1.querySelector(".o-dfm"));

// ===== Regression G3 หลังคา =====
const dg3 = add("3", "roof_vinyl");
want("G3: ไม่มีหมวด 📦 รายละเอียดตู้", !boxNames(dg3).some((x) => /รายละเอียดตู้/.test(x)), boxNames(dg3).join(" | "));

want("ไม่มี JS error", errors.length === 0, errors.slice(0, 2).join(" / "));

let pass = 0;
console.log("\n=== SPEC-G4 (ตู้อลู/ฝาตู้ form-ux + หมวด) ===");
for (const c of checks) { console.log((c.ok ? "  ✓ " : "  ✗ ") + c.n + (c.d ? "  [" + c.d + "]" : "")); if (c.ok) pass++; }
console.log("\nสรุป: ผ่าน " + pass + "/" + checks.length);
process.exit(pass === checks.length ? 0 : 1);
