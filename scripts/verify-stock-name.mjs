/**
 * verify-stock-name — ชื่อวัสดุที่โชว์ต้องมีสีติดมาด้วยเสมอ
 * ─────────────────────────────────────────────────────────────────────────────
 * ทำไมต้องมี (เจ้าของบ่น 20 ส.ค.69): สโตร์เก็บสีไว้ในช่อง color แยกจากชื่อ (0106)
 *   แต่ "แถบรายการ" ในหน้าสโตร์โชว์แค่ชื่อ → Align กุญแจ อบขาว/ดำ ขึ้นชื่อซ้ำกันเป๊ะ
 *   คนเบิกแยกไม่ออก ต้องกดเข้าไปดูทีละตัว (แม้แต่ AI ยังอ่านผิด)
 *   ล็อกไว้: ทุกจุดที่โชว์ชื่อวัสดุต้องผ่าน stockDisplayName ห้ามพิมพ์ชื่อดิบ
 *
 *   node scripts/verify-stock-name.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stockDisplayName } from "../src/lib/stock/display-name.ts";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const ok = (name, cond, got = "") => {
  if (cond) { console.log(`  ✅ ${name}`); pass++; }
  else { console.log(`  ❌ ${name}${got ? "  " + got : ""}`); fail++; }
};

console.log("═══ ชื่อวัสดุต้องมีสีติดมาด้วย ═══");
{
  const t = (row, want) => ok(`${JSON.stringify(row.color)} → ${want}`, stockDisplayName(row) === want, `got=${stockDisplayName(row)}`);
  t({ name: "มือจับบานเลื่อนฝัง Align -กุญแจ", sku: "JR00377", color: "อบขาว" }, "มือจับบานเลื่อนฝัง Align -กุญแจ (อบขาว)");
  t({ name: "มือจับบานเลื่อนฝัง Align -กุญแจ", sku: "JR00374", color: "ดำ" }, "มือจับบานเลื่อนฝัง Align -กุญแจ (ดำ)");
  t({ name: "แป้นรับล็อคบานเลื่อน HD-1104", sku: "JR00475", color: "เงิน" }, "แป้นรับล็อคบานเลื่อน HD-1104 (เงิน)");
  // ชื่อมีสีอยู่แล้ว → ห้ามต่อซ้ำ
  t({ name: "มือบานเลื่อน เมโทร-ชุดกุญแจ-ขาว", sku: "JR00368", color: "" }, "มือบานเลื่อน เมโทร-ชุดกุญแจ-ขาว");
  t({ name: "F7976-เฟรมบน-ล่าง-อบขาว", sku: "F7976", color: "อบขาว" }, "F7976-เฟรมบน-ล่าง-อบขาว");
  t({ name: "ล้อ-15x20x230", sku: "JR00577", color: null }, "ล้อ-15x20x230");
  ok("ชื่อว่าง → ไม่พังเป็น undefined", stockDisplayName({ name: "", color: "ดำ" }) === "—", stockDisplayName({ name: "", color: "ดำ" }));
  ok("ส่ง null เข้ามาก็ไม่พัง", stockDisplayName(null) === "—");
}

console.log("\n═══ ทุกหน้าที่โชว์ชื่อวัสดุต้องเรียก stockDisplayName ═══");
{
  const sc = fs.readFileSync(path.join(ROOT, "src/app/(app)/stock/StockClient.tsx"), "utf8");
  ok("หน้าสโตร์ import ตัวกลาง", sc.includes('from "@/lib/stock/display-name"'), "");
  ok("แถบรายการใช้ stockDisplayName (ไม่ใช่ c.name ดิบ)",
    sc.includes("<span className=\"truncate\">{stockDisplayName(c)}</span>") && !sc.includes("<span className=\"truncate\">{c.name}</span>"), "");
  ok("การ์ดรายละเอียดใช้ตัวเดียวกัน", sc.includes("{stockDisplayName(item)}"), "");
  ok("ค้นหาเจอด้วยสี", sc.includes("[c.name, c.color, c.sku, c.category]"), "");
  ok("CSV นับสต็อกส่งออกชื่อพร้อมสี", sc.includes("stockDisplayName(c), c.category"), "");
  ok("ไม่ประกาศสูตรต่อสีซ้ำในหน้าจอ", !/\$\{item\.name\}\s*\$\{item\.color\}/.test(sc), "");

  const lg = fs.readFileSync(path.join(ROOT, "src/app/api/stock/ledger/route.ts"), "utf8");
  ok("สมุดสโตร์ดึงช่องสีมาด้วย", /stock_items\([^)]*\bcolor\b/.test(lg), "");
  ok("สมุดสโตร์ใช้ stockDisplayName", lg.includes("stockDisplayName(si)"), "");
}

console.log(`\n═══ สรุป: ✅ ${pass} ผ่าน · ❌ ${fail} ไม่ผ่าน ═══`);
process.exit(fail ? 1 : 0);
