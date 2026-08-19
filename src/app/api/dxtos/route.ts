import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// TEMP write helper — สร้างลูกค้า คุณทศรินทร์ (เลี่ยงคอลัมน์ contact_channel ที่ schema cache หาไม่เจอ)
//   + ผูกเข้างาน JR2026-383 (customer_id) · token-gated · ลบหลังใช้ · ไม่แตะเงิน
export async function POST(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("t") !== "tos-2026") return NextResponse.json({ error: "no" }, { status: 404 });
  const sb = createServiceClient() as unknown as { from: (t: string) => any };
  const jobId = "cce8e500-b22b-477e-bf73-1c31cb4e24a4"; // JR2026-383

  // กันซ้ำ — ถ้ามีลูกค้าชื่อนี้แล้วใช้ตัวเดิม
  const { data: existing } = await sb.from("customers").select("id").ilike("name", "คุณทศรินทร์").maybeSingle();
  let custId = existing?.id ?? null;

  if (!custId) {
    const { data: c, error } = await sb.from("customers").insert({
      name: "คุณทศรินทร์",
      phone: "082-654-6699",
      address: "เลขที่ 277/2 ม.เนอวานา บียอนด์ พระราม2 ถ.พระรามที่2 แขวงแสมดำ เขตบางขุนเทียน กรุงเทพฯ 10150",
      contact_person: "Line : Jern (คุณทศรินทร์)",
    }).select("id, name").single();
    if (error) return NextResponse.json({ step: "insert_customer", error: error.message }, { status: 500 });
    custId = c.id;
  }

  const { data: job, error: jErr } = await sb.from("jobs")
    .update({ customer_id: custId }).eq("id", jobId).select("id, job_code, customer_id, status").single();
  if (jErr) return NextResponse.json({ step: "link_job", custId, error: jErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, custId, job });
}
