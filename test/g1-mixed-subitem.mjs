// g1-mixed-subitem.mjs — v7B: บานย่อย "คิดราคาตามชนิดจริง"
// เทียบ calcSubItemPrice(kind) === calcUnit(product ตัวแทนของ kind) ตรงๆ (ห้าม undercharge เป็น fixed_glass)
// + custom ต้องใช้ fprice override · fix = fixed_glass เท่าเดิม · fprice override ชนะราคาชนิด
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HTML_PATH = join(__dirname, "..", "public/calculator/index.html");
const html = readFileSync(HTML_PATH, "utf8");
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => { if (!/scrollTo|Not implemented/i.test(e.message)) console.error("JSDOM:", e.message); });
const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc, url: "http://localhost/calculator/index.html" });
await new Promise((r) => { if (dom.window.document.readyState === "complete") r(); else dom.window.addEventListener("load", r); setTimeout(r, 2000); });
const w = dom.window;

// อ่านค่าผ่าน w.eval (calcUnit/calcSubItemPrice/SUBITEM_KINDS/PBYID = closure global ของ <script>)
function ev(expr){ return w.eval(expr); }

const W = 1.2, H = 2.2; // ขนาดทดสอบต่อชิ้น
const kinds = ["open","slide","fold","awning","fix"];
let pass = 0, fail = 0;
const rows = [];

function near(a, b){ return Math.abs(a - b) < 1; } // ปัดเศษ

for (const k of kinds){
  const pid = ev(`SUBITEM_KINDS['${k}'].pid`);
  const expected = ev(`(function(){var p=PBYID['${pid}'];var r=calcUnit(p,${W},${H},0,0,1,{},false);return r&&r.sell||0;})()`);
  const actual   = ev(`calcSubItemPrice({kind:'${k}',w:${W},h:${H},fprice:0})`);
  const ok = near(actual, expected) && expected > 0;
  rows.push([k, pid, expected, actual, ok ? "PASS" : "FAIL"]);
  ok ? pass++ : fail++;
}

// fix ต้องเท่ากับ fixed_glass เดิม (ไม่เพี้ยนจากของก่อน v7B)
{
  const fixPrice = ev(`calcSubItemPrice({kind:'fix',w:${W},h:${H},fprice:0})`);
  const fgDirect = ev(`(function(){var p=PBYID['fixed_glass'];var r=calcUnit(p,${W},${H},0,0,1,{},false);return r&&r.sell||0;})()`);
  const ok = near(fixPrice, fgDirect);
  rows.push(["fix=fixed_glass", "fixed_glass", fgDirect, fixPrice, ok ? "PASS" : "FAIL"]);
  ok ? pass++ : fail++;
}

// custom: ไม่กรอกราคา = 0 · กรอก fprice = ใช้ fprice
{
  const c0 = ev(`calcSubItemPrice({kind:'custom',w:${W},h:${H},fprice:0})`);
  const c1 = ev(`calcSubItemPrice({kind:'custom',w:${W},h:${H},fprice:5000})`);
  const ok = (c0 === 0) && near(c1, 5000);
  rows.push(["custom (0→0 · fprice 5000→5000)", "-", "0/5000", c0 + "/" + c1, ok ? "PASS" : "FAIL"]);
  ok ? pass++ : fail++;
}

// fprice override ชนะราคาชนิด (เช่น บานเปิด แต่กรอก 9999 → 9999)
{
  const ov = ev(`calcSubItemPrice({kind:'open',w:${W},h:${H},fprice:9999})`);
  const ok = near(ov, 9999);
  rows.push(["fprice override ชนะชนิด (open+9999)", "casement_euro", 9999, ov, ok ? "PASS" : "FAIL"]);
  ok ? pass++ : fail++;
}

// บานเปิด ต้อง "ไม่เท่า" fixed_glass (พิสูจน์แก้ undercharge จริง)
{
  const openP = ev(`calcSubItemPrice({kind:'open',w:${W},h:${H},fprice:0})`);
  const fgP   = ev(`calcSubItemPrice({kind:'fix',w:${W},h:${H},fprice:0})`);
  const ok = openP > fgP; // บานเปิด > กระจกติดตาย (ไม่ undercharge)
  rows.push(["บานเปิด > ติดตาย (แก้ undercharge)", "-", "open>fix", openP + " vs " + fgP, ok ? "PASS" : "FAIL"]);
  ok ? pass++ : fail++;
}

console.log("\n  kind                                  | product       | expected | actual   | ผล");
console.log("  " + "-".repeat(86));
for (const [k, pid, e, a, s] of rows){
  console.log("  " + String(k).padEnd(37) + " | " + String(pid).padEnd(13) + " | " + String(e).padEnd(8) + " | " + String(a).padEnd(8) + " | " + s);
}
console.log("\n  สรุป: PASS " + pass + " / " + (pass + fail) + "  |  FAIL " + fail + "\n");
process.exit(fail ? 1 : 0);
