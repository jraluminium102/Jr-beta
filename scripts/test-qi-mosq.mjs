// test-qi-mosq.mjs — หน้าคิดเร็ว (quick) มุ้ง: ปุ่มหมวด(เฟรม/จีบ/จีบรังผึ้ง/ม้วน)→รุ่น แทน dropdown
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dirname,"..","public/calculator/index.html"),"utf8");
const dom = new JSDOM(html,{runScripts:"dangerously",pretendToBeVisual:true,virtualConsole:new VirtualConsole(),url:"http://localhost/"});
await new Promise(r=>{ if(dom.window.document.readyState==="complete")r(); else dom.window.addEventListener("load",r); setTimeout(r,1500); });
const w=dom.window, doc=w.document;
const fire=(el,t)=>el.dispatchEvent(new w.Event(t,{bubbles:true}));
let pass=0,fail=0; const ck=(c,m)=>{ if(c){pass++;console.log("  ✅ "+m);}else{fail++;console.log("  🔴 "+m);} };

const qi=doc.getElementById("q-items"); qi.innerHTML=""; w.addQuickItem();
const d=qi.querySelector(".ch");
const qg=d.querySelector(".qi-group"); qg.value="5"; fire(qg,"change");
const grps=()=>[...d.querySelectorAll(".qi-famchips [data-mgrp]")].map(b=>b.textContent.trim());
const prods=()=>[...d.querySelectorAll(".qi-famchips [data-id]")].map(b=>b.dataset.id);

console.log("=== ปุ่มหมวด + รุ่น (แทน dropdown) ===");
ck(grps().join("/")==="เฟรม/จีบ/จีบม่านรังผึ้ง/ม้วน", "ปุ่มหมวด 4: "+grps().join(" / "));
ck(prods().join(",")==="imp21,imp22,imp23,imp30", "หมวดเฟรม default → รุ่น 4: "+prods().join(","));
ck(d.querySelector(".qi-prod").style.display==="none", "dropdown qi-prod ซ่อน");
ck([...d.querySelectorAll(".qi-famchips .chip")].every(b=>!/อื่นๆ/.test(b.textContent)), "ไม่มีปุ่ม 'อื่นๆ ▾' (ปุ่มรุ่นครบแล้ว)");

console.log("=== กดหมวด/รุ่น เลือกได้ ===");
const pick=sel=>{ const b=[...d.querySelectorAll(".qi-famchips [data-mgrp],.qi-famchips [data-id]")].find(sel); if(b)b.click(); return b; };
pick(b=>b.dataset.mgrp==="roll");
ck(d.querySelector(".qi-prod").value==="imp29", "กดหมวดม้วน → imp29 (ม้วน default)");
ck(prods().some(x=>/kick/.test(x)), "หมวดม้วน → มีรุ่นเตะ: "+prods().join(","));
pick(b=>b.dataset.id==="mj_kick_300");
ck(d.querySelector(".qi-prod").value==="mj_kick_300", "เลือกเตะ 300 ได้");
ck([...d.querySelectorAll(".qi-famchips [data-id]")].find(b=>b.dataset.id==="mj_kick_300").classList.contains("on"), "ปุ่มเตะ 300 active");

console.log("=== ราคาคิดได้ (เฟรมใหญ่ 1.8×2.0) ===");
pick(b=>b.dataset.mgrp==="frame"); pick(b=>b.dataset.id==="imp23");
const wq=d.querySelector(".qi-w"),hq=d.querySelector(".qi-h"); wq.value="1.8";fire(wq,"input"); hq.value="2.0";fire(hq,"input"); w.calcQuickAll&&w.calcQuickAll();
const price=d.querySelector(".qi-price")?.textContent||"";
ck(/\d/.test(price)&&!/฿0$/.test(price.trim()), "เฟรมใหญ่ราคา: "+price);

console.log(`\n=== ${pass} ผ่าน · ${fail} fail ===`);
process.exit(fail?1:0);
