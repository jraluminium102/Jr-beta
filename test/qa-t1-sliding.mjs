// QA Tester #1 — เครื่องคิดราคา R3.9 กลุ่มบานเลื่อน (SMS + ยูโร)
// พิสูจน์ด้วยการรันจริงใน jsdom: ตั้งขนาด+แบบ → calcQuote() → readItem(ch).r.sell
// คำนวณมือเทียบ: max(min, monoRate(area)) แล้ว roundUp(→พัน)
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../public/calculator/index.html", import.meta.url), "utf8");
const vc = new VirtualConsole();
const errors = [];
vc.on("jsdomError", (e) => errors.push(e.message));

const dom = new JSDOM(html, {
  runScripts: "dangerously",
  pretendToBeVisual: true,
  virtualConsole: vc,
  url: "http://localhost/calculator/index.html",
});
await new Promise((r) => {
  if (dom.window.document.readyState === "complete") r();
  else dom.window.addEventListener("load", r);
  setTimeout(r, 1500);
});
const w = dom.window;
const doc = w.document;

function setField(ch, sel, value) {
  const el = ch.querySelector(sel);
  if (!el) throw new Error("ไม่พบ field " + sel);
  el.value = String(value);
  el.dispatchEvent(new w.Event("input", { bubbles: true }));
  el.dispatchEvent(new w.Event("change", { bubbles: true }));
  return el;
}

// ----- mirror logic จาก HTML เพื่อคำนวณมืออิสระ (ไม่ดึงจากเครื่อง) -----
const RATES = {
  SMS:  [[2.0,2.3,6500],[2.3,3.5,6000],[3.5,4.5,5700],[4.5,5.0,5000],[5.0,7.0,4700],[7.0,9.0,4400],[9.0,12,4200],[12,9999,4000]],
  EURO: [[2.0,2.3,7200],[2.3,3.5,6600],[3.5,4.5,6300],[4.5,5.0,5500],[5.0,7.0,5200],[7.0,9.0,4900],[9.0,12,4700],[12,9999,4400]],
};
const MIN = { sliding_sms: 6500, sliding_euro: 7500 };
const rateOf = (area, t) => {
  if (area < t[0][0]) return t[0][2];
  for (const r of t) { if (area >= r[0] && area < r[1]) return r[2]; }
  return t[t.length-1][2];
};
const monoRate = (area, t) => {
  let v = area * rateOf(area, t);
  for (const r of t) { if (r[1] <= area) { const e = r[1]*r[2]; if (e>v) v=e; } }
  return v;
};
const roundUp = (x) => Math.ceil(x/1000)*1000;

function setupItem(prodId, wv, hv) {
  doc.getElementById("items").innerHTML = "";
  w.addItem();
  const chs = doc.querySelectorAll("#items .ch");
  const d = chs[chs.length - 1];
  if (!d) throw new Error("addItem ไม่สร้าง .ch");
  setField(d, ".i-group", "1");          // งานบาน/กระจก
  setField(d, ".i-prod", prodId);        // เลือกแบบบานเลื่อน
  setField(d, ".i-w", wv);
  setField(d, ".i-h", hv);
  // panels/qty default = 1; ไม่เปิด addon ใด ๆ
  const qtyEl = d.querySelector(".i-qty"); if (qtyEl) setField(d, ".i-qty", "1");
  w.calcQuote();
  return d;
}

const cases = [
  { tc:"TC1", prod:"sliding_sms",  name:"บานเลื่อน SMS",  w:1.8, h:1.2, ratesKey:"SMS"  },
  { tc:"TC2", prod:"sliding_sms",  name:"บานเลื่อน SMS",  w:3.0, h:1.5, ratesKey:"SMS"  },
  { tc:"TC3", prod:"sliding_euro", name:"บานเลื่อน ยูโร", w:2.4, h:2.2, ratesKey:"EURO" },
  { tc:"TC4", prod:"sliding_sms",  name:"บานเลื่อน SMS",  w:1.0, h:1.0, ratesKey:"SMS"  },
];

const rows = [];
for (const c of cases) {
  const d = setupItem(c.prod, c.w, c.h);
  const it = w.readItem(d);
  const t = RATES[c.ratesKey];
  const min = MIN[c.prod];
  const area = +(c.w * c.h).toFixed(4);
  const rate = rateOf(area, t);
  const raw = Math.max(min, monoRate(area, t));
  const expect = roundUp(raw);
  const actual = it ? Math.round(it.r.sell) : NaN;
  const actualArea = it ? +it.r.a.toFixed(4) : NaN;
  const pass = actual === expect;
  rows.push({ ...c, area, actualArea, rate, raw, expect, actual, pass, msgs: it ? (it.r.msgs||[]).join(" · ") : "(readItem=null)" });
}

// ----- รายงาน -----
console.log("=== QA T1 — บานเลื่อน (SMS + ยูโร) R3.9 ===\n");
console.log("| TC | สินค้า | Input(กว้าง×สูง) | พื้นที่ | เรตที่ใช้ | raw=max(min,area×เรต) | Expected(มือ,roundUp) | Actual(it.r.sell) | ผล |");
console.log("|----|--------|------------------|--------|----------|----------------------|----------------------|-------------------|-----|");
for (const r of rows) {
  console.log(`| ${r.tc} | ${r.name} | ${r.w}×${r.h} | ${r.area} (เครื่อง ${r.actualArea}) | ${r.rate.toLocaleString()} | ${Math.round(r.raw).toLocaleString()} | ${r.expect.toLocaleString()} | ${Number.isNaN(r.actual)?"-":r.actual.toLocaleString()} | ${r.pass?"PASS":"FAIL"} |`);
}
const npass = rows.filter(r=>r.pass).length;
console.log(`\nสรุป: ผ่าน ${npass}/${rows.length}`);
console.log("\n--- breakdown (it.r.msgs) ---");
for (const r of rows) console.log(`${r.tc}: ${r.msgs}`);

const jsErrs = errors.filter((e) => !/sheetjs|xlsx|Could not load|external|net::|localStorage|scrollTo|Not implemented/i.test(e));
if (jsErrs.length) console.log("\nJS errors:\n" + jsErrs.join("\n"));

process.exit(npass === rows.length ? 0 : 1);
