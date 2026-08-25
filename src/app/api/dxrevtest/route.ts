import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";

// TEMP (จะลบทิ้ง) — เทส RPC replace_unpaid_installments กับ DB จริง แบบไม่แตะบิลจริง
// GET /api/dxrevtest?t=rev-2026
export async function GET(req: Request) {
  if (new URL(req.url).searchParams.get("t") !== "rev-2026") return NextResponse.json({ error: "no" }, { status: 404 });
  const sb = createServiceClient() as unknown as { from: (t: string) => any; rpc: (fn: string, args: any) => Promise<{ data: any; error: any }> };
  const out: string[] = [];

  // 1) RPC ติดตั้งไหม + gate behavior (เรียก id=0 → ถ้าติดตั้ง+ผ่าน gate จะได้ NOT_FOUND)
  const probe = await sb.rpc("replace_unpaid_installments", { p_bn_id: 0, p_items: [], p_expected_locked_sum: null });
  const perr = probe.error?.message ?? "";
  let installed = "?", gate = "?";
  if (/does not exist|42883|schema cache|could not find/i.test(perr)) { installed = "❌ ยังไม่ติดตั้ง (migration ไม่ผ่าน?)"; }
  else if (/forbidden/i.test(perr)) { installed = "✅ ติดตั้งแล้ว"; gate = "gate ทำงาน (service ถูกปฏิเสธ = ปกติ · การเทสมิวเทตต้องผ่าน UART ผู้ใช้)"; }
  else if (/NOT_FOUND/i.test(perr)) { installed = "✅ ติดตั้งแล้ว"; gate = "service ผ่าน gate (จะลอง dry-run ต่อได้)"; }
  else { installed = "✅ ติดตั้งแล้ว (?)"; gate = "ผลอื่น: " + perr; }
  out.push(`<h3>1) RPC replace_unpaid_installments</h3><p>${installed}<br><i>${gate}</i></p>`);

  // 2) หาบิลจริงที่จ่ายบางส่วน (มีทั้งงวด locked + unpaid) → dry-run preview (read-only, ไม่เรียก RPC mutate)
  const { data: bns } = await sb.from("billing_notes")
    .select("id, code, total, status, billing_installments(id, seq, amount, paid_amount, status)")
    .eq("status", "partial").order("created_at", { ascending: false }).limit(5);
  const esc = (s: any) => String(s ?? "").replace(/[<>&]/g, (c: string) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));
  let sample = "";
  for (const b of (bns ?? [])) {
    const insts = (b.billing_installments ?? []) as any[];
    const isLocked = (i: any) => i.status === "paid" || (Number(i.paid_amount) || 0) > 0; // (dry-run ไม่เช็ค receipt/finance · แค่โชว์แนว)
    const locked = insts.filter(isLocked), unpaid = insts.filter((i) => !isLocked(i));
    if (!locked.length || !unpaid.length) continue;
    const lockedSum = locked.reduce((s, i) => s + (Number(i.amount) || 0), 0);
    const paidLocked = locked.reduce((s, i) => s + (Number(i.paid_amount) || 0), 0);
    const newTotal = (Number(b.total) || 0) + 10000; // สมมติ Rev เพิ่ม 10,000
    const remaining = newTotal - lockedSum;
    sample = `<h3>2) Dry-run บนบิลจริง ${esc(b.code)} (อ่านอย่างเดียว ไม่แก้)</h3>
      <p>total ปัจจุบัน ฿${esc(b.total)} · สมมติ Rev เพิ่มเป็น ฿${esc(newTotal)}</p>
      <table border=1 cellpadding=4 style="border-collapse:collapse"><tr><th>งวด</th><th>ยอด</th><th>จ่าย</th><th>สถานะ</th><th>Rev จะทำ</th></tr>
      ${insts.sort((a, c) => a.seq - c.seq).map((i) => `<tr><td>${i.seq}</td><td>฿${esc(i.amount)}</td><td>฿${esc(i.paid_amount ?? 0)}</td><td>${esc(i.status)}</td><td>${isLocked(i) ? "<b style=color:green>🔒 ตรึง (ไม่แตะ)</b>" : "<b style=color:#c60>♻ re-split</b>"}</td></tr>`).join("")}</table>
      <p>→ งวด locked คงยอดรวม ฿${esc(lockedSum.toFixed(2))} (เงินรับ ฿${esc(paidLocked.toFixed(2))}) · งวดที่เหลือ re-split เป็น ฿${esc(remaining.toFixed(2))} · total ใหม่ ฿${esc(newTotal.toFixed(2))}</p>
      <p><i>ตรวจ: งวดที่จ่ายแล้วต้องขึ้น 🔒 ตรึง · งวดที่ยังไม่จ่ายขึ้น ♻ re-split — ถ้าตรงแบบนี้ = logic ถูก</i></p>`;
    break;
  }
  if (!sample) sample = "<h3>2) Dry-run</h3><p>ไม่พบบิล partial ที่มีทั้งงวดจ่ายแล้ว+ยังไม่จ่าย ตอนนี้ (ข้ามได้)</p>";
  out.push(sample);

  return new NextResponse(
    `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><style>body{font-family:system-ui;padding:16px;font-size:14px;line-height:1.7}h3{color:#7d0f15;margin:16px 0 4px}</style><h2>เทส Rev ใบวางบิล (0126)</h2>${out.join("")}`,
    { headers: { "content-type": "text/html; charset=utf-8" } });
}
