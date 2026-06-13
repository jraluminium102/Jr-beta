// "อื่นๆ" → ช่องค้นหา + ชิป (แก้บั๊ก กดอื่นๆแล้วค้าง · ไม่ใช้ native dropdown 154 รายการ)
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

// หลังกด: ต้องมีช่องค้นหา + ชิปรายการรุ่น (ไม่มี native dropdown โผล่)
const search = d.querySelector(".fam-search");
want("กดอื่นๆ → มีช่องค้นหา .fam-search", !!search);
const list = d.querySelector(".fam-other-list");
want("กดอื่นๆ → มีกล่องชิป .fam-other-list", !!list);
const nChips = list ? list.querySelectorAll(".chip").length : 0;
want("ชิปรุ่นหลายตัว (>10)", nChips > 10, "n=" + nChips);

// native .i-prod ต้องยังซ่อน (ไม่เด้ง dropdown 154)
const ipw = d.querySelector(".i-prod").closest(".full");
want("native .i-prod ยังซ่อน (ไม่ใช้ dropdown)", ipw && ipw.style.display === "none", "disp=" + (ipw && ipw.style.display));

// ===== ค้นหา filter สด =====
const before = list.querySelectorAll(".chip").length;
search.value = "เฟี้ยม";
search.dispatchEvent(new w.Event("input", { bubbles: true }));
const after = d.querySelector(".fam-other-list").querySelectorAll(".chip").length;
want("พิมพ์ 'เฟี้ยม' → กรองเหลือน้อยลง", after > 0 && after < before, "before=" + before + " after=" + after);
const onlyFold = [].every.call(d.querySelector(".fam-other-list").querySelectorAll(".chip"), (c) => /เฟี้ยม/.test(c.textContent));
want("ผลค้นหามีแต่ 'เฟี้ยม'", onlyFold);

// ===== เลือกชิปจากผลค้นหา → product เปลี่ยนจริง =====
const pick = d.querySelector(".fam-other-list .chip");
const pickId = pick.dataset.id;
pick.click(); // g3PickProd → set .i-prod + fire change → rebuild
want("เลือกชิปอื่นๆ → .i-prod = id ที่เลือก", d.querySelector(".i-prod").value === pickId, "prod=" + d.querySelector(".i-prod").value);
want("เลือกแล้ว readItem ได้ราคา (sell>0)", w.readItem(d).r.sell > 0, "sell=" + w.readItem(d).r.sell);

// ===== ไม่พบ → ขึ้นข้อความ =====
const search2 = d.querySelector(".fam-search"); // famOther ยังเปิด หลัง rebuild
if (search2) { search2.value = "zzzไม่มีจริง"; search2.dispatchEvent(new w.Event("input", { bubbles: true }));
  want("ค้นหาไม่เจอ → ขึ้น 'ไม่พบ'", /ไม่พบ/.test(d.querySelector(".fam-other-list").textContent)); }
else want("famOther ยังเปิดหลังเลือก (มีช่องค้นหา)", false, "no .fam-search after pick");

want("ไม่มี JS error", errors.length === 0, errors.slice(0, 2).join(" / "));

let pass = 0;
console.log("\n=== fam-other-search (อื่นๆ → ค้นหา+ชิป) ===");
for (const c of checks) { console.log((c.ok ? "  ✓ " : "  ✗ ") + c.n + (c.d ? "  [" + c.d + "]" : "")); if (c.ok) pass++; }
console.log("\nสรุป: ผ่าน " + pass + "/" + checks.length);
process.exit(pass === checks.length ? 0 : 1);
