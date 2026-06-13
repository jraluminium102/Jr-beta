// F2: OPTION ทางเลือกลูกค้า (cascade) — auto-price + บวกเข้า sell + ขึ้นใบ
//   หมวด→รายการ→±บาท auto (กระจก new−old×area · มือจับ flat) · หลาย OPTION · ขึ้นใบทั้งบานเดี่ยว+ชุด
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../public/calculator/index.html", import.meta.url), "utf8");
const vc = new VirtualConsole(); const errors = [];
vc.on("jsdomError", (e) => { if (!/scrollTo|Not implemented/.test(e.message)) errors.push(e.message); });
const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc, url: "http://localhost/calculator/index.html" });
await new Promise((r) => { if (dom.window.document.readyState === "complete") r(); else dom.window.addEventListener("load", r); setTimeout(r, 1500); });

const w = dom.window, doc = w.document;
const GLASS = w.eval("GLASS");
const checks = [];
const want = (n, ok, d) => checks.push({ n, ok: !!ok, d: d || "" });
const fire = (el, t) => el.dispatchEvent(new w.Event(t, { bubbles: true }));
const noSvc = () => ["svc-protect","svc-lift","svc-travel","svc-ship"].forEach(id=>{const e=doc.getElementById(id); if(e&&e.checked){e.checked=false;fire(e,"change");}});
const subtotal = () => { noSvc(); w.calcQuote(); w.genQuote(); const m=doc.getElementById("quoteContent").innerHTML.match(/รวมเป็นเงิน(?:<\/span>)*<span>([\d,\.]+)/); return m?parseFloat(m[1].replace(/,/g,"")):0; };

function mkDoor(){ doc.getElementById("items").innerHTML=""; w.addItem(doc.getElementById("items")); const ch=doc.querySelector("#items .ch"); ch.querySelector(".i-prod").value="casement_euro"; fire(ch.querySelector(".i-prod"),"change"); ch.querySelector(".i-w").value="2"; fire(ch.querySelector(".i-w"),"input"); ch.querySelector(".i-h").value="2"; fire(ch.querySelector(".i-h"),"input"); return ch; }

// --- O1: กระจก auto-price = (new.s − cur.s) × area ---
let ch = mkDoor();
const base = subtotal();
w.ocAddRow(ch.querySelector(".oc-add"));
let row = ch.querySelector(".oc-row"); row.querySelector(".oc-cat").value="glass"; w.ocCat(row.querySelector(".oc-cat"));
const curS = GLASS[parseInt(ch.querySelector(".i-glass").value)||0].s;
row.querySelector(".oc-item").value="15"; w.ocPick(row.querySelector(".oc-item")); // เทมเปอร์เขียว/ใส 12 (s=2400)
const expDelta = Math.round((2400 - curS) * 4);
want("O1 กระจก auto-delta = (2400−cur)×4", (parseFloat(row.querySelector(".oc-delta").value)||0) === expDelta, "ได้ "+row.querySelector(".oc-delta").value+" คาด "+expDelta);
want("O2 ข้อความ auto 'เปลี่ยนเป็น...'", /^เปลี่ยนเป็น/.test(row.querySelector(".oc-text").value), row.querySelector(".oc-text").value);
want("O3 delta บวกเข้า subtotal", subtotal() === base + expDelta, "base="+base+" after="+subtotal()+" exp="+(base+expDelta));

// --- O4: มือจับ flat (เหมา ไม่ ×area) ---
ch = mkDoor(); const b2 = subtotal();
w.ocAddRow(ch.querySelector(".oc-add")); row = ch.querySelector(".oc-row"); row.querySelector(".oc-cat").value="handle"; w.ocCat(row.querySelector(".oc-cat"));
row.querySelector(".oc-item").value="0"; w.ocPick(row.querySelector(".oc-item")); // Cmech ฝัง ประตู ธรรมดา 1050 flat
want("O4 มือจับ flat = 1050 (ไม่×area)", (parseFloat(row.querySelector(".oc-delta").value)||0) === 1050, "ได้ "+row.querySelector(".oc-delta").value);
want("O5 มือจับ บวกเข้า subtotal", subtotal() === b2 + 1050, "b2="+b2+" after="+subtotal());

// --- O6: หลาย OPTION + other freeform ---
ch = mkDoor(); const b3 = subtotal();
w.ocAddRow(ch.querySelector(".oc-add")); let r1 = ch.querySelectorAll(".oc-row")[0]; r1.querySelector(".oc-cat").value="other"; w.ocCat(r1.querySelector(".oc-cat")); r1.querySelector(".oc-text").value="งานพิเศษ A"; r1.querySelector(".oc-delta").value="2000"; fire(r1.querySelector(".oc-delta"),"input");
w.ocAddRow(ch.querySelector(".oc-add")); let r2 = ch.querySelectorAll(".oc-row")[1]; r2.querySelector(".oc-cat").value="other"; w.ocCat(r2.querySelector(".oc-cat")); r2.querySelector(".oc-text").value="งานพิเศษ B"; r2.querySelector(".oc-delta").value="3000"; fire(r2.querySelector(".oc-delta"),"input");
want("O6 2 OPTION บวกรวม +5000", subtotal() === b3 + 5000, "b3="+b3+" after="+subtotal());
const inv = doc.getElementById("quoteContent").innerHTML.replace(/<[^>]+>/g," ");
want("O7 ใบมี 2 บรรทัด OPTION", (inv.match(/OPTION :/g)||[]).length >= 2, "พบ "+(inv.match(/OPTION :/g)||[]).length);
want("O8 ใบมีข้อความ freeform", /งานพิเศษ A/.test(inv) && /งานพิเศษ B/.test(inv), "");

want("O9 jsdom ไม่มี error", errors.length === 0, errors.join(" | "));

let pass = 0;
checks.forEach(c => { console.log((c.ok ? "[PASS] " : "[FAIL] ") + c.n + (c.ok ? "" : "  → " + c.d)); if (c.ok) pass++; });
console.log(`\nผ่าน ${pass}/${checks.length}`);
process.exit(pass === checks.length ? 0 : 1);
