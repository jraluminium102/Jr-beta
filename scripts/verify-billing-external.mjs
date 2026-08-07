/**
 * verify-billing-external — ใบวางบิล "ลูกค้านอกระบบ" + ผูกเข้าระบบทีหลัง (0124)
 *
 * รัน:  node --experimental-strip-types scripts/verify-billing-external.mjs
 *
 * ตรวจ 2 ชั้น:
 *   ① สูตรเงิน — ยอดใบวางบิลนอกระบบต้องผ่าน computeTotals ตัวกลาง (import ของจริง ไม่ลอกสูตร)
 *   ② สายไฟ — อ่านซอร์สจริง กันเคส "ทำหน้าจอสวยแต่ลืมต่อ" (เคยพลาดมาแล้วกับฟอร์มงานพื้น)
 *      จุดที่ห้ามหลุด: ผูกแล้วต้องเติม finance_entries ย้อนหลัง ไม่งั้นเงินที่รับไปแล้วหายจากบัญชี
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeTotals, suggestInstallments } from "../src/lib/money.ts";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  cond ? pass++ : fail++;
  console.log(`${cond ? "✅" : "❌"} ${name}${cond ? "" : `  ${extra}`}`);
};
const near = (name, got, exp, tol = 0.005) => ok(`${name} = ${got}`, Math.abs(got - exp) <= tol, `(คาด ${exp})`);

console.log("\n═══ ① สูตรเงิน — บิลนอกระบบใช้ตัวกลางเดียวกับทั้งระบบ ═══");
{
  // 3 รายการ + VAT 7 · เทียบมือ: 2×1500 + 1×8000 + 4×250 = 12,000 → VAT 840 → 12,840
  const items = [{ qty: 2, unit_price: 1500 }, { qty: 1, unit_price: 8000 }, { qty: 4, unit_price: 250 }];
  const t = computeTotals({ items, vat_rate: 7, wht_rate: 0, discount_pct: 0 });
  near("หลายรายการ · ยอดก่อนภาษี", t.subtotal, 12000);
  near("หลายรายการ · VAT 7%", t.vat_amt, 840);
  near("หลายรายการ · ยอดสุทธิ", t.net, 12840);

  // ส่วนลดบาทชนะ % (กติกาเดียวกับใบเสนอ/บิลปกติ)
  const d = computeTotals({ items, vat_rate: 7, wht_rate: 0, discount_pct: 50, discount_amt: 2000 });
  near("ส่วนลดบาท 2,000 ชนะ % 50", d.discount_amt, 2000);
  near("ส่วนลดบาท → ยอดสุทธิ", d.net, (12000 - 2000) * 1.07);

  // หัก ณ ที่จ่าย 3% ฐานก่อน VAT (กฎบัญชีไทย · [[vat-wht-decisions-final]])
  const w = computeTotals({ items, vat_rate: 7, wht_rate: 3, discount_pct: 0 });
  near("WHT 3% ฐานก่อน VAT", w.wht_amt, 360);
  near("WHT → ยอดสุทธิ", w.net, 12840 - 360);

  // งวดชำระต้องรวมได้เท่ายอดสุทธิเป๊ะ (ไม่งั้นบิลกับงวดไม่ตรง)
  for (const net of [12840, 9999.5, 250000, 1234.56]) {
    const plan = suggestInstallments(net, 7);
    const sum = plan.reduce((s, p) => s + p.amount, 0);
    ok(`งวดชำระรวม = ยอดสุทธิ (${net})`, Math.abs(sum - net) <= 0.005, `ได้ ${sum}`);
  }
}

console.log("\n═══ ② migration 0124 ═══");
{
  const m = read("supabase/migrations/0124_billing_external_customer.sql");
  ok("เพิ่ม is_external", /add column if not exists is_external\s+boolean/.test(m));
  ok("เพิ่ม linked_at (ไว้ตามรอยว่าดึงเข้าระบบเมื่อไหร่)", /add column if not exists linked_at/.test(m));
  ok("idempotent (รันซ้ำได้)", !/alter table[^;]*add column (?!if not exists)/is.test(m));
}

console.log("\n═══ ③ API สร้างบิลนอกระบบ ═══");
{
  const s = read("src/app/api/billing-notes/external/route.ts");
  ok("ต้องมีสิทธิ์ finance:write", /can\(profile\.role, "finance", "write"\)/.test(s));
  ok("ยอดคิดผ่าน computeTotals (ห้ามคิด VAT เอง)", /computeTotals\(/.test(s) && !/\*\s*0\.07|1\.07/.test(s));
  ok("งวดใช้ suggestInstallments ตัวกลาง", /suggestInstallments\(/.test(s));
  ok("เลขเอกสารออกตามเดือนของ issue_date", /nextDocumentCode\(supabase, "BL", issueDate\)/.test(s));
  ok("ตั้งธง is_external = true", /is_external:\s*true/.test(s));
  ok("ไม่ผูกใบเสนอ/งานตอนสร้าง", /quotation_id:\s*null/.test(s) && /job_id:\s*null/.test(s));
  ok("ยอดสุทธิ ≤ 0 ต้องไม่ให้ออกบิล", /money\.net <= 0/.test(s));
  ok("สร้างงวดพลาด → ลบหัวเอกสารทิ้ง (กันบิลลอยไม่มีงวด)", /delete\(\)\.eq\("id", bn\.id\)/.test(s));
  ok("กันพังถ้า 0124 ยังไม่รัน (fallback ตัด is_external)", /is_external\/i\.test\(bnErr\.message/.test(s));
}

console.log("\n═══ ④ API ผูกเข้าระบบ (จุดที่พลาดแล้วเงินหาย) ═══");
{
  const s = read("src/app/api/billing-notes/[id]/link/route.ts");
  ok("ต้องมีสิทธิ์ finance:write", /can\(profile\.role, "finance", "write"\)/.test(s));
  ok("บิลที่ยกเลิกแล้ว ผูกไม่ได้", /bn\.status === "cancelled"/.test(s));
  ok("บิลที่ผูกใบเสนออยู่แล้ว ผูกซ้ำไม่ได้", /bn\.quotation_id\) return fail/.test(s));
  ok("ใบเสนอที่ยกเลิกแล้ว ผูกไม่ได้", /q\.status === "cancelled"/.test(s));
  ok("กันใบเสนอมีบิล active อยู่แล้ว (วางบิลซ้ำ)", /\.eq\("quotation_id", qid\)[\s\S]{0,120}\.neq\("status", "cancelled"\)/.test(s));
  ok("ผูกแล้ว auto-approve ใบเสนอ (เหมือนโฟลว์วางบิลปกติ)", /update\(\{ status: "approved" \}\)/.test(s));
  ok("ผูก job_id จากใบเสนอ (เงินถึงจะเข้าบัญชี)", /job_id:\s*q\.job_id/.test(s));
  ok("⚠ เติม finance_entries ย้อนหลังงวดที่จ่ายแล้ว", /syncFinanceEntry\(/.test(s) && /\.gt\("paid_amount", 0\)/.test(s));
  ok("ไม่แก้ยอดบิลตามใบเสนอ (บิลส่งลูกค้าไปแล้ว)", !/update\([^)]*\btotal\b/.test(s));
  ok("ยอดไม่ตรง = เตือน ไม่บล็อก", /warnings\.push\(`ยอดไม่ตรงกัน/.test(s));
  ok("ใบเสนอไม่มีงาน = เตือนว่าเงินยังไม่เข้าบัญชี", /ยังไม่ผูกงาน/.test(s));
  ok("ไม่ทับหัวบิลอัตโนมัติ (ต้องติ๊ก sync_customer เอง)", /sync_customer \?\s*\{ customer_snapshot/.test(s));
  // ออกใบเสร็จไปแล้วตอนยังไม่ผูก → entry ต้องผูก receipt_id ไม่งั้น void ใบเสร็จแล้วเงินไม่ถอย
  ok("เติมเงินย้อนหลังผูก receipt_id ด้วย", /receiptOf\.get\(it\.id\)/.test(s));
  ok("หา receipt ด้วย is_voided (ไม่ใช่ status)", /from\("receipts"\)[\s\S]{0,180}\.eq\("is_voided", false\)/.test(s));
}
{
  const b = read("src/lib/billing.ts");
  ok("syncFinanceEntry export ให้ตัวผูกเรียกได้", /export async function syncFinanceEntry\(/.test(b));
  ok("รับชำระตอนไม่มี job_id ยังข้าม sync (เหตุผลที่ต้องเติมย้อนหลัง)", /if \(bn\.job_id && paid > 0\)/.test(b));
}

console.log("\n═══ ⑤ หน้าจอต่อสายครบไหม ═══");
{
  const n = read("src/app/(app)/billing-notes/new/NewBillingClient.tsx");
  ok("มีสวิตช์เลือกโหมด จากใบเสนอ / นอกระบบ", /useState<"quote" \| "external">\("quote"\)/.test(n));
  ok("โหมดนอกระบบ render ฟอร์มจริง", /mode === "external" \? \(\s*<ExternalBillingForm \/>/.test(n));
  ok("ไม่มีใบเสนอเลย ก็ยังวางบิลนอกระบบได้ (ไม่ตันหน้าเปล่า)", /ลูกค้านอกระบบ[\s\S]{0,80}ผูกใบเสนอทีหลัง/.test(n));

  const f = read("src/app/(app)/billing-notes/new/ExternalBillingForm.tsx");
  ok("ฟอร์มยิงไป /api/billing-notes/external", /fetch\("\/api\/billing-notes\/external"/.test(f));
  ok("ฟอร์มคิดยอดด้วย computeTotals (พรีวิวตรงกับที่บันทึกจริง)", /computeTotals\(/.test(f));
  ok("ฟอร์มรับหลายรายการ (ไม่ใช่บรรทัดเดียว)", /\+ เพิ่มบรรทัด/.test(f));
  ok("กันกดรัว/ดับเบิลแท็บ", /busyRef\.current/.test(f));

  const p = read("src/app/(app)/billing-notes/[id]/page.tsx");
  ok("หน้ารายละเอียดโชว์แผงผูก เมื่อยังไม่ผูก", /\{unlinked && writable && \(\s*<LinkToSystemPanel/.test(p));
  ok("ไม่เสนอผูกให้ใบค่าประเมิน (assess ตั้งใจไม่ผูกงาน)", /!isAssess/.test(p));
  ok("ไม่เสนอผูกให้ใบที่ยกเลิกแล้ว", /unlinked = !bn\.quotation_id && !isAssess && !isCancelled/.test(p));
  ok("กรองใบเสนอที่มีบิล active ออกจากตัวเลือก", /used\.has\(q\.id\)/.test(p));

  const l = read("src/app/(app)/billing-notes/[id]/LinkToSystemPanel.tsx");
  ok("แผงยิง PATCH ไป /link", /method: "PATCH"[\s\S]{0,200}\/link`/.test(l) || /\/link`,\s*\{\s*method: "PATCH"/.test(l));
  ok("แผงเตือนเมื่อยอดไม่ตรง", /mismatch/.test(l));
  ok("แผงเตือนเมื่อใบเสนอไม่มีงาน", /!selected\.job_id/.test(l));
  ok("ผูกเสร็จ refresh หน้า", /router\.refresh\(\)/.test(l));

  const li = read("src/app/(app)/billing-notes/page.tsx");
  ok("หน้ารายการขึ้นป้าย 'นอกระบบ'", /นอกระบบ<\/Badge>/.test(li));
  ok("ป้ายไม่ขึ้นกับใบค่าประเมิน/ใบยกเลิก", /!== "assess" && r\.status !== "cancelled"/.test(li));
}

console.log(`\n═══ สรุป: ✅ ${pass} ผ่าน · ❌ ${fail} ไม่ผ่าน ═══`);
process.exit(fail ? 1 : 0);
