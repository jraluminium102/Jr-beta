// "อื่นๆ" = บานที่เหลือ (cat ที่ไม่อยู่ในปุ่มหลัก) เป็นชิป — ไม่ใช่ search · ไม่ใช้ native dropdown 154 (แก้บั๊กค้าง)
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
function add(group, prod) { w.addItem(); const chs = doc.querySelectorAll("#items .ch"); const d = chs[chs.length - 1]; sf(d, ".i-group", group); if (prod) sf(d, ".i-prod", prod); return d; }

// ===== กลุ่ม 1 บานเลื่อน → กดอื่นๆ =====
const d = add("1", "sliding_euro");
const otherBtn = [].find.call(d.querySelectorAll('.fam-prodsel .chip'), (c) => /อื่นๆ/.test(c.textContent));
want("มีปุ่ม 'อื่นๆ ▾'", !!otherBtn);
otherBtn.click(); // famPickOther → buildItemOpts re-render

// ไม่มีช่องค้นหาแล้ว (มติพี่นัท: ไม่เอา search)
want("กดอื่นๆ → ไม่มีช่องค้นหา (.fam-search)", !d.querySelector(".fam-search"));
const list = d.querySelector(".fam-other-list");
want("กดอื่นๆ → มีกล่องชิปบานที่เหลือ", !!list);

// ชิปที่เหลือ = cat ที่ไม่อยู่ในปุ่มหลัก FAM_CATS['1']
const mainCats = w.FAM_CATS ? w.FAM_CATS["1"] : null;
const restChips = [].map.call(list.querySelectorAll(".chip"), (c) => c.dataset.cat);
want("ชิปที่เหลือมี บานเปลือย/shower/บานหมุน", restChips.includes("บานเปลือย") && restChips.includes("shower") && restChips.includes("บานหมุน"), restChips.join(","));
want("ชิปที่เหลือ ไม่ซ้ำกับปุ่มหลัก (ไม่มี บานเลื่อน/บานเปิด)", !restChips.includes("บานเลื่อน") && !restChips.includes("บานเปิด"), restChips.join(","));
want("จำนวนชิปที่เหลือ < รุ่นทั้งกลุ่ม (ไม่ใช่ 43)", restChips.length > 0 && restChips.length < 15, "n=" + restChips.length);

// native .i-prod ยังซ่อน
const ipw = d.querySelector(".i-prod").closest(".full");
want("native .i-prod ยังซ่อน (ไม่ใช้ dropdown)", ipw && ipw.style.display === "none", "disp=" + (ipw && ipw.style.display));

// ===== เลือกชิปบานเปลือย → product เปลี่ยน + famOther ยังเปิด + รุ่นย่อยโผล่ =====
const fl = [].find.call(d.querySelectorAll(".fam-other-list .chip"), (c) => /เปลือย/.test(c.textContent));
fl.click();
want("เลือก บานเปลือย → .i-prod = รุ่น frameless", /frameless/.test(d.querySelector(".i-prod").value), "prod=" + d.querySelector(".i-prod").value);
want("เลือกแล้ว famOther ยังเปิด (ชิปที่เหลือยังโชว์)", d.dataset.famOther === "1" && !!d.querySelector(".fam-other-list"));
const onChip = [].find.call(d.querySelectorAll(".fam-other-list .chip"), (c) => c.classList.contains("on"));
want("ชิปบานเปลือยถูกไฮไลต์ (.on)", onChip && onChip.dataset.cat === "บานเปลือย", onChip ? onChip.dataset.cat : "none");
want("เลือกแล้ว readItem ได้ราคา (sell>0)", w.readItem(d).r.sell > 0, "sell=" + w.readItem(d).r.sell);

// รุ่นย่อยของบานเปลือย (frameless มีหลายรุ่น) → มีแถวรุ่น
const grids = d.querySelectorAll(".fam-prodsel .chip-grid");
want("มีแถวรุ่นย่อย (>=2 chip-grid: หลัก+เหลือ, อาจมีรุ่น)", grids.length >= 2, "grids=" + grids.length);

// ===== กลับไปเลือกปุ่มหลัก → famOther ปิด =====
const mainSliding = [].find.call(d.querySelectorAll('.fam-prodsel .chip[data-cat="บานเลื่อน"]'), () => true);
if (mainSliding) { mainSliding.click(); want("กดปุ่มหลัก (บานเลื่อน) → famOther ปิด", d.dataset.famOther !== "1", "famOther=" + d.dataset.famOther); }

want("ไม่มี JS error", errors.length === 0, errors.slice(0, 2).join(" / "));

let pass = 0;
console.log("\n=== fam-other-search (อื่นๆ → บานที่เหลือ เป็นชิป) ===");
for (const c of checks) { console.log((c.ok ? "  ✓ " : "  ✗ ") + c.n + (c.d ? "  [" + c.d + "]" : "")); if (c.ok) pass++; }
console.log("\nสรุป: ผ่าน " + pass + "/" + checks.length);
process.exit(pass === checks.length ? 0 : 1);
