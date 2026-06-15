// สร้าง "ใบเสนอราคาตัวอย่าง" ของห้องต่อเติม (กั้นห้องกระจก) จาก engine จริง → HTML standalone (ไว้ทำ PDF + เทียบใบจริง)
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(ROOT, "public/calculator/index.html"), "utf8");
const vc = new VirtualConsole();
const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc, url: "http://localhost/" });
await new Promise(r => { dom.window.addEventListener("load", r); setTimeout(r, 1500); });
const w = dom.window, doc = w.document;
const fire = (el, t) => el && el.dispatchEvent(new w.Event(t, { bubbles: true }));

// เปิด Protection (พื้น/ผนัง) ให้เหมือนภาพที่พี่นัทเจอ · ปิดบริการอื่น
["svc-lift","svc-travel","svc-ship"].forEach(id=>{ const e=doc.getElementById(id); if(e&&e.checked){e.checked=false; fire(e,'change');} });

doc.getElementById("items").innerHTML = "";
const cn = doc.getElementById("custName"); if (cn) { cn.value = "คุณตัวอย่าง / ระเบียงคอนโด"; fire(cn,'input'); }
const qd = doc.getElementById("qdate"); if (qd) { qd.value = "15-06-69"; fire(qd,'input'); }

const d = w.addGlasshouseSet();
const st = d.__g6state;
st.sides = [
  { type:'glass', cols:[
    { pcs:[{ cat:'บานเปิด', id:'casement_euro', w:0.9, h:2.1, opt:{ thresh:'turtle', mosq:1, mosqId:'mj_sd_basic', fcsides:4 } }] },
    { pcs:[{ cat:'ติดตาย', id:'fixed_glass', w:1.2, h:2.5, opt:{} }] },
    { pcs:[{ cat:'บานเลื่อน', id:'sliding_euro', w:2.4, h:2.1, opt:{ mosq:1, mosqId:'mj_sd_basic', digi:'5' } }] },
  ]},
  { type:'wall', aw:2.5, ah:2.6, cols:[] },
];
st.roof = { on:1, matId:'roof_vinyl', w:5, l:3, frame:'โครงอลูมิเนียม', gut:1000, gutlen:5, eave:0, ex:{} };
st.elec = { down:3, sw:1 };
w.calcQuote(); w.genQuote();

const qc = doc.getElementById("quoteContent");
const css = [...doc.querySelectorAll("style")].map(s => s.textContent).join("\n");
const out = `<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"><title>ใบเสนอราคาตัวอย่าง — ห้องต่อเติม G6</title>
<style>@page{size:A4;margin:8mm;}${css}\nbody{background:#fff;padding:6px;}</style></head>
<body>${qc.outerHTML}</body></html>`;
const dest = join(ROOT, "docs", "กลุ่ม6-กั้นห้องกระจก", "SAMPLE-G6-invoice-2026-06-15.html");
writeFileSync(dest, out, "utf8");
console.log("Wrote", dest, "(" + Math.round(out.length/1024) + " KB)");
// echo breakdown
const detTd = qc.querySelector("table.qt tbody tr td:nth-child(2)");
console.log("\n--- รายการในใบ ---\n" + (detTd ? detTd.textContent.replace(/\n{2,}/g,'\n').trim() : "(none)"));
