/**
 * verify-deposit-guard — guard "มัดจำ vs ยอดงวด 1" ของ applyInstallmentPayment
 * รัน: node --experimental-strip-types scripts/verify-deposit-guard.mjs
 *
 * กติกา (เจ้าของเจอบล็อกจริง 7 ส.ค.69 · BL2569080013):
 *   บันทึก > เงินที่เข้าจริง  → ต้องบล็อก (บัญชีจะเกินความจริง)
 *   บันทึก ≤ เงินที่เข้าจริง  → ต้องผ่าน (เงินอยู่ในมือมากกว่าที่บันทึก ไม่อันตราย)
 *
 * ใช้ supabase ปลอม (stub) — เทส logic จริงของ applyInstallmentPayment ไม่ลอกสูตรมาเทส
 */
import { applyInstallmentPayment } from "../src/lib/billing.ts";

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { cond ? pass++ : fail++; console.log(`${cond ? "✅" : "❌"} ${name}${cond ? "" : "  " + extra}`); };

/** supabase ปลอม: คืนค่าตามตาราง แล้วจดว่ามีการเขียนอะไรบ้าง */
function stub({ instAmount, instSeq, instPaid, depositAmount }) {
  const writes = [];
  const q = (table) => {
    const st = { table, _filters: {} };
    const chain = new Proxy(st, {
      get(t, k) {
        if (k === "then") return undefined;
        if (["select", "eq", "is", "order", "limit", "gt", "neq", "in"].includes(k)) return () => chain;
        if (k === "update") return (payload) => { writes.push({ table, op: "update", payload }); return chain; };
        if (k === "insert") return (payload) => { writes.push({ table, op: "insert", payload }); return chain; };
        if (k === "single" || k === "maybeSingle") {
          return async () => {
            if (table === "billing_installments") return { data: { amount: instAmount, seq: instSeq, paid_amount: instPaid }, error: null };
            if (table === "billing_notes") return { data: { job_id: "JOB-1", total: 389480, billing_installments: [{ paid_amount: 0 }] }, error: null };
            if (table === "finance_entries") return { data: depositAmount == null ? null : { amount: depositAmount }, error: null };
            return { data: null, error: null };
          };
        }
        return () => chain;
      },
    });
    return chain;
  };
  return { client: { from: q }, writes };
}

const run = async (o) => {
  const s = stub(o);
  const r = await applyInstallmentPayment(s.client, { installmentId: 1, billingNoteId: "1", paidAmount: o.recording });
  return { error: r.error, writes: s.writes };
};

console.log("\n═══ เคสจริงที่เจ้าของโดนบล็อก (BL2569080013) ═══");
{
  // มัดจำเข้าจริง 141,240 · งวด 1 = 123,000 · กำลังบันทึก 123,000
  const r = await run({ instAmount: 123000, instSeq: 1, instPaid: 0, depositAmount: 141240, recording: 123000 });
  ok("มัดจำ 141,240 > งวด 1 = 123,000 → ต้องผ่าน (เดิมบล็อก)", !r.error, r.error ?? "");
  ok("ปิดงวดจริง (มีการเขียน billing_installments)", r.writes.some((w) => w.table === "billing_installments" && w.op === "update"), "");
}

console.log("\n═══ ทางอันตราย — ต้องยังบล็อกอยู่ ═══");
{
  // เคสเดิมที่ guard ถูกสร้างมาแก้: มัดจำจริง 30,000 แต่งวด 1 = 59,500
  const r = await run({ instAmount: 59500, instSeq: 1, instPaid: 0, depositAmount: 30000, recording: 59500 });
  ok("มัดจำ 30,000 < บันทึก 59,500 → ต้องบล็อก", !!r.error, "ไม่บล็อก!");
  ok("ข้อความบอกว่าบันทึกเกินเงินจริง", /มากกว่าเงินที่เข้าจริง/.test(r.error ?? ""), r.error ?? "");
  ok("บล็อกก่อนแตะงวด (ไม่เขียนอะไรเลย)", r.writes.length === 0, JSON.stringify(r.writes).slice(0, 120));
}
{
  const r = await run({ instAmount: 141240, instSeq: 1, instPaid: 141240 - 100, depositAmount: 141240, recording: 200 });
  ok("จ่ายสะสมแล้วเกินมัดจำ 100 บาท → ต้องบล็อก", !!r.error, "ไม่บล็อก!");
}

console.log("\n═══ เคสปกติ — ต้องผ่านเหมือนเดิม ═══");
{
  const r = await run({ instAmount: 123000, instSeq: 1, instPaid: 0, depositAmount: 123000, recording: 123000 });
  ok("มัดจำ = งวด 1 พอดี → ผ่าน", !r.error, r.error ?? "");
}
{
  const r = await run({ instAmount: 123000, instSeq: 1, instPaid: 0, depositAmount: 141240, recording: 50000 });
  ok("จ่ายบางส่วน 50,000 (< มัดจำ) → ผ่าน", !r.error, r.error ?? "");
}
{
  const r = await run({ instAmount: 247000, instSeq: 2, instPaid: 0, depositAmount: 141240, recording: 247000 });
  ok("งวด 2 ไม่โดน guard มัดจำ (guard เฉพาะงวด 1)", !r.error, r.error ?? "");
}
{
  const r = await run({ instAmount: 123000, instSeq: 1, instPaid: 0, depositAmount: null, recording: 123000 });
  ok("ไม่มีมัดจำค้าง → ผ่านปกติ", !r.error, r.error ?? "");
}
{
  const r = await run({ instAmount: 123000, instSeq: 1, instPaid: 0, depositAmount: 141240, recording: 130000 });
  ok("จ่ายเกินยอดงวด (130,000 > งวด 123,000) → ยังบล็อกด้วยกฎเดิม", /จ่ายเกินยอดงวด/.test(r.error ?? ""), r.error ?? "");
}

console.log(`\n═══ สรุป: ✅ ${pass} ผ่าน · ❌ ${fail} ไม่ผ่าน ═══`);
process.exit(fail ? 1 : 0);
