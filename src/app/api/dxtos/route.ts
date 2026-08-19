import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// TEMP write — ดัน JR2026-193 (ช่างเจี๊ยบ) จาก READY กลับเข้าผลิต active = QUEUED (รอลงผลิต · stage 15)
//   ลอก logic override-status (status + current_stage + ลบใบติดตั้งค้าง) · service client · token-gated · ลบทันที
const JOB_ID = "e2bfa0a7-6e0f-4d70-9bd2-51171cede4bc";
const PROD_ID = "939b6c68-19c5-4181-969d-447ee9515017";
const NEW_STATUS = "QUEUED";
const NEW_STAGE = 15;

export async function POST(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("t") !== "tos-2026") return NextResponse.json({ error: "no" }, { status: 404 });
  const sb = createServiceClient() as unknown as { from: (t: string) => any };

  const { error: e1 } = await sb.from("productions").update({ status: NEW_STATUS }).eq("id", PROD_ID);
  if (e1) return NextResponse.json({ step: 1, error: e1.message }, { status: 500 });

  // ออกจาก READY → ลบใบติดตั้งที่ยังไม่เริ่ม (กัน orphan หน้าติดตั้ง)
  await sb.from("installations").delete().eq("job_id", JOB_ID).eq("status", "PENDING");

  const { error: e2 } = await sb.from("jobs").update({ current_stage: NEW_STAGE }).eq("id", JOB_ID);
  if (e2) return NextResponse.json({ step: 2, error: e2.message }, { status: 500 });

  const { data: prod } = await sb.from("productions").select("id, status").eq("id", PROD_ID).maybeSingle();
  const { data: job } = await sb.from("jobs").select("current_stage, status").eq("id", JOB_ID).maybeSingle();
  return NextResponse.json({ ok: true, prod, job });
}
