/**
 * verify-pricing-mode — ตัวตรวจ "สลับคิดต่อโล ↔ ราคาต่อหน่วยตรง" + ป้ายบอกโหมดในหน้าสโตร์
 * รัน: node --experimental-strip-types scripts/verify-pricing-mode.mjs
 *
 * เจ้าของสั่ง 19 ส.ค.69: "บางอันไม่มีน้ำหนักต่อโล ให้ราคาเป็นเส้นไปก่อน
 *   แต่ต้องเขียนบอกชัดเจนในหน้าสโตร์ และมีปุ่มให้แก้เป็นราคาต่อโลได้ในอนาคต โดยไม่บัค"
 *
 * "ไม่บัค" แปลว่า 3 อย่างนี้ต้องจริง:
 *   ① ไม่มีน้ำหนัก = เปลี่ยนเป็นต่อโลไม่ได้ (ไม่งั้นราคาต่อหน่วยกลายเป็น 0)
 *   ② สลับโหมดแล้วราคาต่อหน่วยต้องเท่าเดิม (ไม่กระโดด)
 *   ③ ทุกครั้งที่สลับ ต้องลงประวัติราคา (ห้ามเปลี่ยนต้นทุนเงียบ ๆ)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { cond ? pass++ : fail++; console.log(`${cond ? "✅" : "❌"} ${name}${cond ? "" : "  " + extra}`); };

const api = fs.readFileSync(path.join(ROOT, "src/app/api/stock/[id]/pricing-mode/route.ts"), "utf8");
const apiCode = api.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
const cli = fs.readFileSync(path.join(ROOT, "src/app/(app)/stock/StockClient.tsx"), "utf8");

console.log("\n═══ ① ไม่มีน้ำหนัก → เปลี่ยนเป็นคิดต่อโลไม่ได้ ═══");
{
  ok("API บล็อกเมื่อน้ำหนัก ≤ 0", /if \(kg <= 0\) return fail\(/.test(apiCode), "");
  ok("ข้อความบอกวิธีแก้ (ใส่น้ำหนักก่อน)", /ใส่น้ำหนักก่อน/.test(api), "");
  ok("ปุ่มบนหน้าจอกดไม่ได้ด้วย (ไม่ใช่ปล่อยไปเด้ง error)",
    cli.includes("const blocked = toWeight && kg <= 0") && cli.includes("disabled={busy || blocked}"), "");
  ok("ชี้เมาส์แล้วบอกเหตุผล", /title=\{blocked \?/.test(cli), "");
}

console.log("\n═══ ② สลับโหมดแล้วราคาต่อหน่วยต้องไม่ขยับ ═══");
{
  // ต่อหน่วย → ต่อโล : เรตตั้งต้น = ราคาต่อหน่วย ÷ น้ำหนัก แล้วคูณกลับได้เท่าเดิม
  ok("ไป 'ต่อโล': เรตตั้งต้นคิดจากราคาที่มีอยู่ ÷ น้ำหนัก",
    /newRate = round2\(\(rate > 0 \? rate \* kg : cost\) \/ kg\)/.test(apiCode), "");
  ok("ไป 'ต่อโล': ราคาต่อหน่วยใหม่ = เรต × น้ำหนัก", /newCost = round2\(newRate \* kg\)/.test(apiCode), "");
  ok("กลับ 'ต่อหน่วยตรง': ยึดราคาต่อหน่วยเดิมไว้",
    /newCost = round2\(cost > 0 \? cost : rate \* kg\)/.test(apiCode), "");
  ok("ไม่มีราคาให้ยึดเลย → ไม่ยอมสลับ", /ยังไม่มีราคาให้ยึด/.test(api), "");
  // คิดมือทวนสูตร: ราคา 1,200 · น้ำหนัก 6.25 → เรต 192 → 192 × 6.25 = 1,200 เท่าเดิม
  const kg = 6.25, cost = 1200;
  const rate = Math.round((cost / kg) * 100) / 100;
  ok("ทวนเลข: 1,200 ฿ ÷ 6.25 กก. = 192 ฿/กก. → ×6.25 = 1,200 เท่าเดิม",
    Math.abs(rate * kg - cost) < 0.01, `${rate} × ${kg} = ${rate * kg}`);
}

console.log("\n═══ ③ สลับแล้วต้องลงประวัติราคาเสมอ ═══");
{
  ok("insert stock_prices ทุกครั้งที่สลับ", apiCode.includes('.from("stock_prices").insert('), "");
  ok("ลงประวัติก่อน แล้วค่อยสลับธง (history-first)",
    apiCode.indexOf('stock_prices') < apiCode.indexOf('is_weight_based: toWeight'), "");
  ok("ประวัติล้ม = ไม่เปลี่ยนอะไรเลย", /ยังไม่มีอะไรเปลี่ยน/.test(api), "");
  ok("บันทึกว่าใครเปลี่ยน", apiCode.includes("created_by: profile.id") && /profile\.full_name/.test(apiCode), "");
  ok("ไป 'ต่อหน่วยตรง' ต้องล้าง price_per_kg (ไม่ค้างเรตเก่าไว้หลอกตา)",
    /price_per_kg: toWeight \? newRate : null/.test(apiCode), "");
  ok("ต้องเป็น ADMIN/ACCOUNTING", apiCode.includes('["ADMIN", "ACCOUNTING"]') && apiCode.includes("FORBIDDEN()"), "");
  ok("สลับเป็นโหมดเดิมซ้ำ → ไม่ทำอะไร (กันประวัติขยะ)",
    /=== toWeight\)\s*\n?\s*return fail/.test(apiCode.replace(/\s+/g, " ")) || apiCode.includes("อยู่แล้ว"), "");
}

console.log("\n═══ ④ หน้าสโตร์บอกชัดเจนว่าตัวไหนคิดยังไง ═══");
{
  ok("ตัวที่คิดต่อโล → ขึ้นป้าย 'คิดต่อโล'", cli.includes(">\n                  คิดต่อโล\n                </span>") || cli.includes("คิดต่อโล"), "");
  ok("ตัวที่ยังไม่คิดต่อโล → ขึ้นป้าย 'ตั้งราคาต่อ…ตรง'", cli.includes("ตั้งราคาต่อ{item.unit}ตรง"), "");
  ok("บอกด้วยว่าทำไมยังไม่คิดต่อโล (ไม่มีน้ำหนัก)", cli.includes("ยังไม่มีน้ำหนักต่อ"), "");
  ok("ถ้ามีน้ำหนักแล้ว บอกว่าเปลี่ยนได้เลย", cli.includes("เปลี่ยนเป็นคิดต่อโลได้เลย"), "");
  ok("ตัวที่คิดต่อโล บอกว่าแก้เรตแล้วราคาคิดใหม่ให้", cli.includes("ราคาต่อ{item.unit}คิดใหม่ให้เอง"), "");
  ok("มีปุ่มสลับโหมดบนหน้าจอ", cli.includes("<ModeSwitch item={item}"), "");
  ok("ปุ่มถามยืนยันก่อน พร้อมบอกว่าจะเกิดอะไร", cli.includes("if (!confirm(msg)) return"), "");
  ok("สลับเสร็จรีเฟรชข้อมูล", /onDone\(\);\s*\n\s*\}/.test(cli), "");
}

console.log(`\n═══ สรุป: ✅ ${pass} ผ่าน · ❌ ${fail} ไม่ผ่าน ═══`);
process.exit(fail ? 1 : 0);
