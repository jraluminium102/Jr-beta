import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";
const html = readFileSync(new URL("../public/calculator/index.html", import.meta.url), "utf8");
const vc=new VirtualConsole(); const errs=[]; vc.on("jsdomError",e=>{if(!/Not implemented:|scrollIntoView|scrollTo/.test(e.message))errs.push(e.message);});
const dom=new JSDOM(html,{runScripts:"dangerously",pretendToBeVisual:true,virtualConsole:vc,url:"http://localhost/calculator/index.html"});
await new Promise(r=>{if(dom.window.document.readyState==='complete')r();else dom.window.addEventListener('load',r);setTimeout(r,1500);});
const w=dom.window,doc=w.document; const fire=(el,t)=>el.dispatchEvent(new w.Event(t,{bubbles:true}));
const C=[]; const want=(n,ok,d)=>C.push({n,ok:!!ok,d:d||""});
const sv=(ch,sel,v)=>{const e=ch.querySelector(sel); if(e){e.value=String(v);fire(e,"input");fire(e,"change");}};
function ykk(){ doc.getElementById("items").innerHTML=""; w.addItem(doc.getElementById("items")); const ch=doc.querySelector("#items .ch"); sv(ch,".i-group","1"); sv(ch,".i-prod","ykk_vent"); sv(ch,".i-w","0.9"); sv(ch,".i-h","2.1"); return ch; }
const ch=ykk();
want("ykk_vent มีครอบวงกบ (.o-fcsides)", !!ch.querySelector(".o-fcsides"), ch.querySelector(".o-fcsides")?"มี":"ไม่มี");
want("ykk_vent มีดรอปพื้น (.o-dfm)", !!ch.querySelector(".o-dfm"), ch.querySelector(".o-dfm")?"มี":"ไม่มี");
const base=w.readItem(ch).r.sell;
// ดรอปพื้นบวกเงินจริง (สูตรร่วม 5,000+(dfm-7)×750 · roundUp อาจปัดส่วนเศษ)
const ch2=ykk(); sv(ch2,".o-dfm","8"); const d8=w.readItem(ch2).r.sell;
want("ดรอปพื้น 8 ม. บน YKK → บวกเงิน ≥5,000", d8-base>=5000, "Δ="+(d8-base));
const ch3=ykk(); sv(ch3,".o-dfm","2"); const d2=w.readItem(ch3).r.sell;
want("ดรอปพื้น 2 ม. บน YKK → บวกเงิน ≥5,000", d2-base>=5000, "Δ="+(d2-base));
// ครอบวงกบ 4 ด้าน (ผ่านชิป) — +4,000 (ci ขาว เรต 700 × 4ด้าน... ครอบวงกบใช้ fcm? ใช้ o-fcsides → คิดต่อด้าน)
const ch4=ykk(); const fcChip=Array.from(ch4.querySelectorAll('.chip[data-val="4"]')).find(b=>b.closest('.chip-group')&&/o-fcsides/.test(b.getAttribute('onclick')||"")); if(fcChip)fcChip.click(); const fc4=w.readItem(ch4).r.sell;
want("ครอบวงกบ 4 ด้าน บน YKK → บวกเงิน (>base)", fc4>base, "Δ="+(fc4-base));
let pass=0; for(const c of C){console.log((c.ok?"✅":"❌")+" "+c.n+"  ["+c.d+"]"); if(c.ok)pass++;}
console.log(`\n${pass}/${C.length} ผ่าน`+(errs.length?` · jsErrors:${errs.length}`:""));
process.exit(pass===C.length?0:1);
