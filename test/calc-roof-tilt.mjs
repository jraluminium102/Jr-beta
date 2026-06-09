// Regression: หลังคาเลื่อน (optSlide) + บานกระทุ้ง tilt & turn (awn_mode)
//   ทดสอบผ่าน DOM จริง (เลือก product → ติ๊ก/เลือก option → อ่าน subtotal)
//   ยึดความสัมพันธ์ราคา + delta ที่นิยามชัด: tilt=+5,000/บาน · มอเตอร์ qty=×ราคา/ตัว · บานเลื่อน +tier/บาน
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../public/calculator/index.html", import.meta.url), "utf8");
const vc = new VirtualConsole(); const errors = [];
vc.on("jsdomError", (e) => { if (!/scrollTo|Not implemented/.test(e.message)) errors.push(e.message); });
const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc, url: "http://localhost/calculator/index.html" });
await new Promise((r) => { if (dom.window.document.readyState === "complete") r(); else dom.window.addEventListener("load", r); setTimeout(r, 1500); });

const w = dom.window, doc = w.document;
const checks = [];
const want = (n, ok, d) => checks.push({ n, ok: !!ok, d: d || "" });
const fire = (el, t) => el.dispatchEvent(new w.Event(t, { bubbles: true }));
const noSvc = () => ["svc-protect","svc-lift","svc-travel","svc-ship"].forEach(id=>{const e=doc.getElementById(id); if(e&&e.checked){e.checked=false;fire(e,"change");}});
const subtotal = () => { noSvc(); w.calcQuote(); w.genQuote(); const m=doc.getElementById("quoteContent").innerHTML.match(/รวมเป็นเงิน<\/span><span>([\d,\.]+)/); return m?parseFloat(m[1].replace(/,/g,"")):0; };
const setV = (ch, sel, v) => { const el=ch.querySelector(sel); if(!el) throw new Error("ไม่พบ "+sel); el.value=String(v); fire(el,"input"); fire(el,"change"); return el; };

function mkProd(group, prodId, W, H){
  doc.getElementById("items").innerHTML="";
  w.addItem(doc.getElementById("items"));
  const ch=doc.querySelector("#items .ch");
  setV(ch, ".i-group", group);                       // repopulate .i-prod ตามกลุ่ม
  const ps=ch.querySelector(".i-prod"); ps.value=prodId; fire(ps,"change");
  setV(ch, ".i-w", W); setV(ch, ".i-h", H);
  return ch;
}

// ============ บานกระทุ้ง tilt & turn (awn_mode) ============
// awning_euro · กลุ่ม 1 · w=2 h=1.5
{
  const ch = mkProd("1", "awning_euro", 2, 1.5);
  const sel = ch.querySelector(".o-awn_mode");
  want("TT0 select awn_mode มี 3 ตัวเลือก", sel && sel.options.length === 3, sel?("ได้ "+sel.options.length):"ไม่พบ select");

  // panels = 1
  const pn = ch.querySelector(".i-panels"); if(pn){ pn.value="1"; fire(pn,"input"); }
  sel.value="0"; fire(sel,"change"); const p1_std = subtotal();
  sel.value="1"; fire(sel,"change"); const p1_side = subtotal();
  sel.value="2"; fire(sel,"change"); const p1_tilt = subtotal();
  want("TT1 เปิดข้าง (awn_mode=1) ไม่บวกราคา (= Std)", p1_side === p1_std, "std="+p1_std+" side="+p1_side);
  want("TT2 tilt&turn 1 บาน = +5,000", p1_tilt - p1_std === 5000, "Δ="+(p1_tilt-p1_std));

  // panels = 2 → tilt = +10,000
  if(pn){ pn.value="2"; fire(pn,"input"); }
  sel.value="0"; fire(sel,"change"); const p2_std = subtotal();
  sel.value="2"; fire(sel,"change"); const p2_tilt = subtotal();
  want("TT3 tilt&turn 2 บาน = +10,000 (5,000×บาน)", p2_tilt - p2_std === 10000, "Δ="+(p2_tilt-p2_std));
}

// ============ หลังคาเลื่อน (optSlide) ============
// roof_vinyl · กลุ่ม 3 · w=4 h=3 (a=12) → tier(a≤20)=6,750 · marea(N=2)=8 → มอเตอร์ auto 28,000
{
  const ch = mkProd("3", "roof_vinyl", 4, 3);
  const slideBox = ch.querySelector(".o-slide");
  want("RS0 มี checkbox ทำหลังคาเลื่อน", !!slideBox, "ไม่พบ .o-slide");

  const base = subtotal();                              // ยังไม่เลื่อน
  slideBox.checked = true; fire(slideBox, "change");    // onchange → rfSlideMotorFill + แสดง wrap
  const slideOn = subtotal();
  want("RS1 ติ๊กหลังคาเลื่อน → ราคาเพิ่ม", slideOn > base, "base="+base+" on="+slideOn);

  const motorPrice = parseFloat(ch.querySelector(".o-smotorprice").value)||0;
  want("RS2 มอเตอร์ auto-fill = 28,000 (marea=8 ≤14)", motorPrice === 28000, "ได้ "+motorPrice);

  // จำนวนบาน 2→3: +tier 1 บาน (a≤20 = 6,750) · มอเตอร์คงเดิม (marea 8→9 ยัง ≤14)
  // sell ปัดขึ้นพัน (roundUp = ceil/1000×1000) → 6,750 เห็นเป็น 6,000 หรือ 7,000
  const sp = ch.querySelector(".o-spanels");
  sp.value="2"; fire(sp,"input"); const n2 = subtotal();
  sp.value="3"; fire(sp,"input"); const n3 = subtotal();
  want("RS3 เพิ่มบานเลื่อน 2→3 = +tier 6,750/บาน (ปัดพัน→6,000/7,000)", n3 - n2 === 6000 || n3 - n2 === 7000, "Δ="+(n3-n2));

  // มอเตอร์ qty 1→2: +ราคา/ตัว (28,000)
  sp.value="2"; fire(sp,"input");
  const mq = ch.querySelector(".o-smotorqty");
  mq.value="1"; fire(mq,"input"); const q1 = subtotal();
  mq.value="2"; fire(mq,"input"); const q2 = subtotal();
  want("RS4 มอเตอร์ 1→2 ตัว = +28,000 (×ราคา/ตัว)", q2 - q1 === 28000, "Δ="+(q2-q1));

  // กรอกราคามอเตอร์เอง (override auto) — 28,000 → 10,000 ลด 18,000 (qty=1)
  mq.value="1"; fire(mq,"input"); const before = subtotal();
  const mp = ch.querySelector(".o-smotorprice"); mp.value="10000"; fire(mp,"input"); // input → dataset.edited=1
  const after = subtotal();
  want("RS5 กรอกราคามอเตอร์เอง 28,000→10,000 = −18,000", before - after === 18000, "Δ="+(before-after));

  // หัวข้อใบโชว์ชนิดหลังคา
  const inv = doc.getElementById("quoteContent").innerHTML.replace(/<[^>]+>/g," ");
  want("RS6 ใบโชว์ 'หลังคาไวนิล'", /หลังคาไวนิล/.test(inv), "");
}

// ============ มือจับรุ่นอื่น (กรอกชื่อ+ราคาเอง) ============
// casement_euro (digihandle) · ใช้ราคา 3,000 (พันเต็ม → roundUp ไม่กวน delta)
{
  const ch = mkProd("1", "casement_euro", 2, 2);
  const hn = ch.querySelector(".o-handlename"), hp = ch.querySelector(".o-handleprice");
  want("HN0 มีช่องมือจับรุ่นอื่น (ชื่อ+ราคา)", !!hn && !!hp, "");
  const base = subtotal();
  hn.value = "HD182"; fire(hn, "input"); hp.value = "3000"; fire(hp, "input");
  const after = subtotal();
  want("HN1 กรอกราคามือจับเอง 3,000 = +3,000", after - base === 3000, "Δ="+(after-base));
  const inv = doc.getElementById("quoteContent").textContent.replace(/ /g, " ");
  want("HN2 ใบโชว์ 'มือจับ HD182'", inv.includes("มือจับ HD182"), "");
  hp.value = "0"; fire(hp, "input");
  want("HN3 ราคา 0 → ไม่บวก", subtotal() === base, "Δ="+(subtotal()-base));
}

// ============ UX หลังคา P1-P4 + BUG กล่องค้าง (แชท B) ============
{
  const ch = mkProd("3", "roof_vinyl", 4, 3);
  // P1: ของเสริม → details พับ (ตัวใน open=false) · ช่องหลักนอก details
  const inner = [...ch.querySelectorAll("details")].find(d => { const s = d.querySelector(":scope > summary"); return s && /ของเสริมหลังคา/.test(s.textContent); });
  want("P1 ของเสริมหลังคา = details พับ (open=false)", !!inner && inner.open === false, inner ? ("open=" + inner.open) : "ไม่เจอ details");
  want("P1 ช่องหลัก (แป/โครงสร้าง/ปลายหลังคา) ยังอยู่", !!ch.querySelector(".o-roofbatten") && !!ch.querySelector(".o-roofframe") && !!ch.querySelector(".o-roofend"), "");
  want("P1 ของเสริม (รางน้ำ/ซ่อนสโลป) อยู่ใน details", !!inner && !!inner.querySelector(".o-rfgut") && !!inner.querySelector(".o-rfhs"), "");
  // P2/P4: เปิดหลังคาเลื่อน
  const slide = ch.querySelector(".o-slide"); slide.checked = true; fire(slide, "change");
  want("P2 ชิปจำนวนบาน 4 ตัว [2][3][4][6]", ch.querySelectorAll(".spanel-chip").length === 4, "ได้ " + ch.querySelectorAll(".spanel-chip").length);
  want("P4 พื้นที่เลื่อน placeholder=auto", ch.querySelector(".o-sarea").getAttribute("placeholder") === "auto", "");
  want("P4 มอเตอร์ helper auto โชว์", /auto/.test(ch.querySelector(".o-smotor-auto").textContent), JSON.stringify(ch.querySelector(".o-smotor-auto").textContent));
  want("P4 ช่องราคามอเตอร์ซ่อน default", ch.querySelector(".o-smotorprice-wrap").style.display === "none", "");
  // P2: กดชิป → set spanels + active
  w.rfSetSpanels(ch.querySelector('.spanel-chip[data-n="4"]'), 4);
  want("P2 กดชิป4 → o-spanels=4 + active", ch.querySelector(".o-spanels").value === "4" && ch.querySelector('.spanel-chip[data-n="4"]').classList.contains("on"), "");
  // BUG: สลับเป็นบานเลื่อนแล้วกลับ → ไม่มีกล่องค้าง
  const g = ch.querySelector(".i-group"); g.value = "1"; fire(g, "change");
  const ps = ch.querySelector(".i-prod"); ps.value = "sliding_euro"; fire(ps, "change");
  g.value = "3"; fire(g, "change"); ps.value = "roof_vinyl"; fire(ps, "change");
  want("BUG สลับ product ไม่เหลือ .sliding-main-block ค้าง", ch.querySelectorAll(".sliding-main-block").length === 0, "เหลือ " + ch.querySelectorAll(".sliding-main-block").length);
  want("BUG .i-panels-wrap ไม่หาย (เหลือ 1)", ch.querySelectorAll(".i-panels-wrap").length === 1, "เหลือ " + ch.querySelectorAll(".i-panels-wrap").length);
}

want("Z jsdom ไม่มี error", errors.length === 0, errors.join(" | "));

let pass = 0;
checks.forEach(c => { console.log((c.ok ? "[PASS] " : "[FAIL] ") + c.n + (c.ok ? "" : "  → " + c.d)); if (c.ok) pass++; });
console.log(`\nผ่าน ${pass}/${checks.length}`);
process.exit(pass === checks.length ? 0 : 1);
