// verify-sub-pane.mjs — ด่านกัน "ผสมบาน (บานย่อย) คิดไม่เป็นของ / กดเพิ่มแล้วราคาไม่ขยับ"
// รัน:  node scripts/verify-sub-pane.mjs
// ─────────────────────────────────────────────────────────────────────────────
// เจ้าของสั่ง 29 ต.ค.69: บานย่อยต้องถอดของจริงเหมือนบานหลัก (ขาย/ทุน/ค่าแรง/รายการของ)
//   ① ทุกปุ่มเพิ่มใน SUB_GROUPS ต้องคิดได้ (ขาย > 0 · ทุนจาก BOM · มีรายการของ)
//   ② ทุน/ขาย ต้องเท่ากับคิดรุ่นนั้นตรง ๆ ผ่าน panePrice (ชุดเดียวกับหน้า G1/ห้องกระจก)
//   ③ ของเสริมจริง (มุ้ง R4.0) ต้องขึ้นเป็นรายการของ ไม่ใช่เหมา +3,000
//   ④ ใบเก่า (mat/gridmark แบบเหมา) ยังได้ราคาเดิม
//   ⑤ ขายส่ง (mfg) ใช้ยอดไม่รวมติดตั้ง
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { subCalc, subPrice, subDesc, SUB_GROUPS } from "../src/lib/calculator40/sub-pane.ts";
import { panePrice } from "../src/lib/calculator40/pane-calc.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PB = JSON.parse(fs.readFileSync(path.join(__dirname, "../src/lib/calculator40/pricebook.json"), "utf8"));

let pass = 0, fail = 0;
const ok = (label, cond, got = "") => { cond ? pass++ : fail++; console.log(`  ${cond ? "✅" : "❌"} ${label}${cond || got === "" ? "" : `  (${got})`}`); };
const PO = { manual: false, edit: null, mat: 100, prod: 100, inst: 200 };
const GLASS = "เขียว 6มม.";

console.log("═══ ① ทุกปุ่มเพิ่ม คิดเป็นของได้ ═══");
for (const grp of SUB_GROUPS) {
  for (const [pid, label, w, h] of grp.items) {
    if (pid === "_custom") continue;
    const s = { key: 1, pid, label, w, h, n: 1, addons: {} };
    const c = subCalc(s, PB, "white", GLASS, 100, PO);
    ok(`${label} (${pid} ${w}×${h}) ขาย ${c.amount} · ทุนของ ${Math.round(c.cost)} · ค่าแรง ${Math.round(c.labor.prod + c.labor.install)} · ของ ${c.lines.length} รายการ`,
      c.amount > 0 && c.cost > 0 && c.lines.length > 0 && c.labor.prod > 0 && c.labor.install > 0);
    // ② เท่ากับคิดรุ่นนั้นตรง ๆ
    const x = panePrice({ key: 0, typeKey: pid, w, h, n: 1, addons: {} }, PB, "white", GLASS, 100, undefined, PO);
    ok(`   = คิดรุ่นตรง ๆ (ขาย ${x.amount} · ทุน ${Math.round(x.r.cost.total)})`, c.amount === x.amount && Math.abs(c.cost - x.r.cost.total) < 0.01 && c.lines.length === x.r.lines.length);
  }
}

console.log("\n═══ ③ ของเสริมจริง (มุ้ง) ═══");
{
  const base = { key: 1, pid: "sms_slide", label: "บานเลื่อน", w: 1.8, h: 2.2, n: 2, addons: {} };
  const b = subCalc(base, PB, "white", GLASS, 100, PO);
  const m = subCalc({ ...base, addons: { mosquito: "small" } }, PB, "white", GLASS, 100, PO);
  ok("เลือกมุ้งเฟรม → ขายขึ้น", m.amount > b.amount, `${b.amount} → ${m.amount}`);
  ok("มุ้งขึ้นเป็นรายการของ (ไม่ใช่เหมา +3,000)", m.lines.some((l) => /มุ้ง/.test(l.name || "")) && m.amount - b.amount !== 3000, String(m.amount - b.amount));
  ok("ข้อความลงใบมี + มุ้ง", /มุ้ง/.test(subDesc({ ...base, addons: { mosquito: "small" } })), subDesc({ ...base, addons: { mosquito: "small" } }));
  ok("ไม่มีของเสริม = ข้อความไม่มี +", !/\+/.test(subDesc(base)), subDesc(base));
}

console.log("\n═══ ④ ใบเก่า (แบบเหมา) ราคาเดิม ═══");
{
  const old = { key: 1, pid: "open_door", label: "บานเปิด", w: 0.9, h: 2.2, n: 1, mat: "frame", gridmark: "yes" };   // ไม่มี addons = ใบเก่า
  const b = subCalc({ ...old, mat: "none", gridmark: "none" }, PB, "white", GLASS, 100, PO);
  const o = subCalc(old, PB, "white", GLASS, 100, PO);
  ok("มุ้งเฟรม +3,000 + คาดตาราง +2,000 = +5,000 (เหมาเดิม)", o.amount - b.amount === 5000 && o.legacyExtra === 5000, String(o.amount - b.amount));
  ok("ข้อความใบเก่า +มุ้งเฟรม +คาดตาราง", /\+มุ้งเฟรม/.test(subDesc(old)) && /\+คาดตาราง/.test(subDesc(old)), subDesc(old));
  const cleared = { ...old, mat: "none", gridmark: "none", addons: {} };
  ok("กดล้างแล้ว = ราคารุ่นล้วน", subCalc(cleared, PB, "white", GLASS, 100, PO).amount === b.amount);
}

console.log("\n═══ ⑤ ขายส่ง / ราคาแยก / กรอกเอง ═══");
{
  const s = { key: 1, pid: "fixed", label: "ช่องแสงบน", w: 1.2, h: 0.4, n: 1, addons: {} };
  const all = subCalc(s, PB, "white", GLASS, 100, PO, "all");
  const mfg = subCalc(s, PB, "white", GLASS, 100, PO, "mfg");
  ok("ขายส่ง ถูกกว่า รวมติดตั้ง · ค่าติดตั้ง 0", mfg.amount < all.amount && mfg.labor.install === 0 && all.labor.install > 0, `${mfg.amount} vs ${all.amount}`);
  ok("ราคาแยก override = ใช้ตัวที่กรอก", subPrice({ ...s, fprice: 9999 }, PB, "white", GLASS, 100, PO) === 9999);
  const cu = subCalc({ key: 1, pid: "_custom", label: "อื่นๆ", desc: "ช่องลม", price: 4000, w: 1, h: 1, n: 1 }, PB, "white", GLASS, 100, PO);
  ok("กรอกเอง = ราคาที่กรอก · ไม่มีรายการของ", cu.amount === 4000 && cu.lines.length === 0);
}

console.log(`\n═══ สรุป: ✅ ${pass} ผ่าน · ❌ ${fail} ไม่ผ่าน ═══`);
process.exit(fail ? 1 : 0);
