// ทดสอบ "กั้นห้องกระจก" ระบบใหม่ (HANDOFF-G6 A4 · 2026-06-14): เลิก setbox เดิม → paged room builder
//   addGlasshouseSet() → ไอเทมกลุ่ม 6 (ห้องต่อเติม) · ราคา = roomTotal (engine จริง) · genQuote โชว์ห้อง
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../public/calculator/index.html", import.meta.url), "utf8");
const vc = new VirtualConsole();
const errors = [];
vc.on("jsdomError", (e) => { if (!/sheetjs|xlsx|external|Could not load|scrollTo|Not implemented/i.test(e.message)) errors.push(e.message); });
const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc, url: "http://localhost/calculator/index.html" });
await new Promise((r) => { if (dom.window.document.readyState === "complete") r(); else dom.window.addEventListener("load", r); setTimeout(r, 1500); });
const w = dom.window, doc = w.document;
const checks = [];
const want = (n, ok, d) => checks.push({ n, ok: !!ok, d: d || "" });
const txt = (el) => (el.textContent || "").replace(/\s+/g, " ").trim();

["svc-protect","svc-lift","svc-travel","svc-ship"].forEach((id)=>{ const e=doc.getElementById(id); if(e&&e.checked){e.checked=false; e.dispatchEvent(new w.Event("change",{bubbles:true}));} });
doc.getElementById("items").innerHTML = "";

// ===== ระบบใหม่: addGlasshouseSet() = ห้องต่อเติม (paged builder) =====
const d = w.addGlasshouseSet();
want("G0 addGlasshouseSet() คืนไอเทม .ch (ไม่ใช่ setbox เดิม)", !!d && d.classList.contains("ch"), "");
want("G1 ไอเทมเป็นโหมดห้อง (.g6room)", d && d.classList.contains("g6room"), "");
want("G2 group = 6", (d.querySelector(".i-group")||{}).value === "6", "");
want("G3 builder render (มี .g6r-wrap)", !!d.querySelector(".g6r-mount .g6r-wrap"), "");
want("G4 มีแท็บ pager (ด้าน/หลังคา/ไฟ/สรุป)", d.querySelectorAll(".g6r-tabs .tab").length >= 4, "tabs=" + d.querySelectorAll(".g6r-tabs .tab").length);
want("G5 มีบานเริ่มต้นใน wall mixer", d.querySelectorAll(".g6r-wall .pane").length >= 1, "");

// ราคา = roomTotal (engine จริง) > 0
w.calcQuote();
const it = w.readItem(d);
want("G6 readItem = room (room:true)", it && it.room === true, "");
want("G7 ราคาห้อง > 0 (engine จริง)", it && it.r && it.r.sell > 0, "sell=" + (it && it.r ? it.r.sell : "?"));
want("G8 i-price แสดงราคา", /[0-9]/.test((d.querySelector(".i-price")||{}).textContent || ""), "");

// เพิ่มด้าน B (ผ่าน builder action) → roomTotal เพิ่ม
const sell1 = w.readItem(d).r.sell;
if (w.G6RaddSide) w.G6RaddSide();
const sell2 = w.readItem(d).r.sell;
want("G9 เพิ่มด้าน → ราคาห้องเพิ่ม", sell2 > sell1, "1=" + sell1 + " 2=" + sell2);

// genQuote โชว์ห้อง
w.genQuote();
const t = txt(doc.getElementById("quoteContent"));
want("G10 ใบออก ไม่ว่าง", t.length > 50, "len=" + t.length);
want("G11 มี 'ห้องต่อเติม' หรือ 'กั้นห้องกระจก' ในใบ", /ห้องต่อเติม|กั้นห้องกระจก/.test(t), t.slice(0, 100));
want("G12 ไม่มี 'ค่าทำชุด' (ยกเลิกแล้ว)", !t.includes("ค่าทำชุด"), "");

// สลับ group 6 → 1 : เลิกโหมดห้อง กลับฟอร์มปกติ
const grp = d.querySelector(".i-group"); grp.value = "1"; grp.dispatchEvent(new w.Event("change", { bubbles: true }));
want("G13 สลับออกกลุ่ม 6 → ไม่ใช่ห้องแล้ว", !d.classList.contains("g6room"), "");
want("G14 กลับมาเป็นบานปกติ readItem ได้ราคา", (w.readItem(d)||{}).r ? w.readItem(d).r.sell > 0 : false, "");

want("G15 ไม่มี JS error", errors.length === 0, errors.slice(0, 2).join(" / "));

let pass = 0;
console.log("=== กั้นห้องกระจก (ระบบ room ใหม่ A4) ===");
for (const c of checks) { console.log((c.ok ? "✅" : "❌") + " " + c.n + (c.ok ? "" : "  → " + c.d)); if (c.ok) pass++; }
console.log(`\nผ่าน ${pass}/${checks.length}`);
process.exit(pass === checks.length ? 0 : 1);
