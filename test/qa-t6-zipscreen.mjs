// qa-t6-zipscreen.mjs — QA #6 · กลุ่มงานที่ 7 "ม่านซิป" (zipscreen)
// ตรวจว่า engine ในเครื่องคิดราคาหลัก = สูตรเครื่องคิดราคาม่านซิปเดิมเป๊ะ
// reimplement สูตรอิสระแล้วเทียบกับ it.r.sell ที่เครื่องคำนวณจริง
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dirname, "../public/calculator/index.html"), "utf8");
const vc = new VirtualConsole();
const errors = [];
vc.on("jsdomError", (e) => errors.push(e.message));
const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc, url: "http://localhost/calculator/index.html" });
await new Promise((r) => { if (dom.window.document.readyState === "complete") r(); else dom.window.addEventListener("load", r); setTimeout(r, 1500); });
const w = dom.window, doc = w.document;

function fire(el, type) { el.dispatchEvent(new w.Event(type, { bubbles: true })); }
function addItem(container) { w.addItem(container); const chs = container.querySelectorAll(".ch"); return chs[chs.length - 1]; }
function setField(ch, sel, value) { const el = ch.querySelector(sel); if (!el) throw new Error("ไม่พบ " + sel); el.value = String(value); fire(el, "input"); fire(el, "change"); return el; }
function setItem(ch, cfg) {
  if (cfg.group != null) setField(ch, ".i-group", cfg.group);
  if (cfg.prod != null) {
    const ps = ch.querySelector(".i-prod");
    if (!ps.querySelector('option[value="' + cfg.prod + '"]')) ps.innerHTML = w.prodOptionsG6(String(cfg.group));
    ps.value = cfg.prod; fire(ps, "change");
  }
  if (cfg.w != null) setField(ch, ".i-w", cfg.w);
  if (cfg.h != null) setField(ch, ".i-h", cfg.h);
  if (cfg.opts) for (const [sel, val] of Object.entries(cfg.opts)) {
    const oel = ch.querySelector(sel); if (oel) { oel.value = String(val); fire(oel, "input"); fire(oel, "change"); }
  }
}
function clearItems() { doc.getElementById("items").innerHTML = ""; }

// ---- reimplement สูตรเครื่องม่านซิปเดิม (อิสระจาก engine) ----
const FAB = {
  Z100:{"0":1220,"1":1160,"3":1220,"5":1090,"10":1090,"30":1090,"PET":1290},
  Z120:{"0":1330,"1":1270,"3":1330,"5":1200,"10":1200,"30":1200,"PET":1400},
  Z145D:{"0":2390,"1":2390,"3":2390,"5":2390,"10":2390,"30":2390,"PET":2390},
  Z120W:{"0":2340,"1":2280,"3":2340,"5":2210,"10":2210,"30":2210,"PET":null}
};
const CTRL={manual:810,aok220:2340,dooya:2210,aok50n:2730};
const MIN={Z100:3,Z120:3,Z145D:3,Z120W:6};
const MARK={retail:2.0,project:1.75};
const pick=(w,h)=> w>5?"Z120W":(h>3?"Z120":"Z100");
function expectSell(o){
  const m = o.model==="auto"?pick(o.w,o.h):o.model;
  let rate=FAB[m][o.fab]; if(rate==null) rate=FAB[m]["5"];
  const mul=m==="Z145D"?2:1;
  const area=Math.max(o.w*o.h, MIN[m]);
  const landed=area*rate+CTRL[o.ctrl]*mul;
  const goods=landed*MARK[o.grp];
  return Math.round(goods/100)*100;
}

const TCS = [
  { t:"TC1 ปลีก auto→Z100 5% AOK220 3×3", o:{grp:"retail",model:"auto",fab:"5",ctrl:"aok220",w:3,h:3} },
  { t:"TC2 ปลีก auto→Z120W 5% AOK50N 6×3", o:{grp:"retail",model:"auto",fab:"5",ctrl:"aok50n",w:6,h:3} },
  { t:"TC3 ปลีก Z145D(2ชั้น) 0% AOK220 3×3", o:{grp:"retail",model:"Z145D",fab:"0",ctrl:"aok220",w:3,h:3} },
  { t:"TC4 โครงการ auto→Z100 5% มือดึง 4×2", o:{grp:"project",model:"auto",fab:"5",ctrl:"manual",w:4,h:2} },
  { t:"TC5 ปลีก Z100 ขั้นต่ำ 1×1→3ตร.ม.", o:{grp:"retail",model:"Z100",fab:"5",ctrl:"manual",w:1,h:1} },
  { t:"TC6 ปลีก Z120 10% DOOYA 4.8×3.8", o:{grp:"retail",model:"Z120",fab:"10",ctrl:"dooya",w:4.8,h:3.8} },
];

const rows=[]; let pass=0;
for (const tc of TCS) {
  errors.length=0; clearItems();
  const ch=addItem(doc.getElementById("items"));
  setItem(ch,{group:7,prod:"zipscreen",w:tc.o.w,h:tc.o.h,
    opts:{".o-zgrp":tc.o.grp,".o-zmodel":tc.o.model,".o-zfab":tc.o.fab,".o-zctrl":tc.o.ctrl}});
  w.calcQuote();
  const it=w.readItem(ch);
  const actual=it && it.r ? it.r.sell : null;
  const exp=expectSell(tc.o);
  const ok = actual===exp;
  if(ok) pass++;
  rows.push({t:tc.t, exp, actual, ok, msg:(it&&it.r&&it.r.msgs?it.r.msgs[0]:"")});
}

console.log("=== QA-T6 ม่านซิป (กลุ่มงานที่ 7) — engine เทียบสูตรเดิม ===\n");
for (const r of rows) {
  console.log(`${r.ok?"PASS":"FAIL"} ${r.t}`);
  console.log(`   expected ฿${r.exp.toLocaleString()}  ·  actual ฿${(r.actual??0).toLocaleString()}`);
  console.log(`   ${r.msg}`);
}
console.log(`\nสรุป: ผ่าน ${pass}/${TCS.length}` + (errors.length?` · JS errors: ${errors.length}`:" · ไม่มี JS error"));
if (pass !== TCS.length) process.exitCode = 1;
