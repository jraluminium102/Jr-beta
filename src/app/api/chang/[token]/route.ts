import { z } from "zod";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getChangToken } from "@/lib/chang-token";

// ── API สาธารณะสำหรับลิงก์ช่าง (ไม่ต้อง login) — ป้องกันด้วยโทเคน (env หรือ DB) ──
// อ่านตารางผลิต + กดมาร์ค 4 ช่องเท่านั้น (service role + whitelist field กันใช้ผิด)
export const dynamic = "force-dynamic";

async function tokenOk(token: string) {
  const expected = await getChangToken();
  return !!expected && token === expected;
}

const MARK_FIELDS = ["design_received", "glass_installed", "qc_before_glass", "qc_after_glass"] as const;
const DONE: Record<string, string> = { design_received: "ได้รับแบบ", glass_installed: "ใส่แล้ว", qc_before_glass: "ผ่าน", qc_after_glass: "ผ่าน" };
const AUDIT: Record<string, [string, string]> = {
  design_received: ["design_received_by", "design_received_at"],
  glass_installed: ["glass_installed_by", "glass_installed_at"],
  qc_before_glass: ["qc_before_by", "qc_before_at"],
  qc_after_glass: ["qc_after_by", "qc_after_at"],
};
const SET_COLS =
  "id, job_id, set_label, seq, design_received, glass_installed, qc_before_glass, qc_after_glass, glass_spec, screen_type, screen_installed, glass_order, mat_equipment, mat_alu_normal, mat_alu_painted, frame_status, measurer_name, measure_actual, must_finish_date, glass_done_date, actual_done_date, install_date, note";

type Row = Record<string, unknown>;

// GET /api/chang/:token — ตารางผลิต (งานในคิว + ชุดงาน)
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  // diagnostic ชั่วคราว: บอกแค่ว่า env ตั้งไว้ไหม + ยาวกี่ตัว (ไม่โชว์ค่า) เพื่อ debug
  const dbg = new URL(_req.url).searchParams.get("debug");
  if (dbg === "1") {
    const t = await getChangToken();
    const src = process.env.CHANG_LINK_TOKEN ? "env" : (t ? "db" : "none");
    return NextResponse.json({ configured: !!t, len: t.length, source: src, matchesParam: t === params.token });
  }
  if (!(await tokenOk(params.token))) return NextResponse.json({ error: "ไม่พบหน้านี้" }, { status: 404 });
  const sb = createServiceClient() as unknown as { from: (t: string) => any };

  const { data: prods } = await sb
    .from("productions")
    .select("id, job_id, status, production_queued, planned_install_date, job:job_id(job_code, customer_name, customer_area, status)")
    .in("status", ["QUEUED", "MANUFACTURING", "QC", "READY"]);
  const jobs = (prods ?? []).filter((p: Row) => (p.job as { status?: string } | null)?.status !== "CANCELLED");
  const jobIds = jobs.map((p: Row) => p.job_id as string | null).filter(Boolean) as string[];

  let setsByJob: Record<string, Row[]> = {};
  if (jobIds.length) {
    const { data: sets } = await sb.from("production_sets").select(SET_COLS).in("job_id", jobIds).order("seq").order("id");
    setsByJob = (sets ?? []).reduce((a: Record<string, Row[]>, s: Row) => { (a[s.job_id as string] ??= []).push(s); return a; }, {});
  }

  const rows = jobs.map((p: Row) => {
    const job = p.job as { job_code?: string; customer_name?: string; customer_area?: string } | null;
    return {
      kind: "job" as const, id: p.id as string, job_id: (p.job_id as string) ?? null,
      title: job?.customer_name ?? "—", job_code: job?.job_code ?? null, customer_area: job?.customer_area ?? null,
      produce_date: (p.production_queued as string | null) ?? null, install_date: (p.planned_install_date as string | null) ?? null,
      status: p.status as string, sets: p.job_id ? (setsByJob[p.job_id as string] ?? []) : [],
    };
  }).sort((a, b) => (a.produce_date ?? "9999-99-99").localeCompare(b.produce_date ?? "9999-99-99"));

  return NextResponse.json({ data: rows });
}

const patchSchema = z.object({
  set_id: z.number().int(),
  field: z.enum(MARK_FIELDS),
  value: z.string(),       // ค่าที่จะลง (ค่า done / "" / ค่า undone)
  by: z.string().max(60).optional(),  // ชื่อช่างที่กด (ไว้ audit)
});

// PATCH /api/chang/:token — มาร์ค 1 ช่อง (เฉพาะ 4 ช่อง whitelist)
export async function PATCH(req: Request, { params }: { params: { token: string } }) {
  if (!(await tokenOk(params.token))) return NextResponse.json({ error: "ไม่พบหน้านี้" }, { status: 404 });
  let body;
  try { body = patchSchema.parse(await req.json()); }
  catch { return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }

  const marked = body.value === DONE[body.field];
  const [byCol, atCol] = AUDIT[body.field];
  const patch: Record<string, unknown> = {
    [body.field]: body.value === "" ? null : body.value,
    [byCol]: marked ? (body.by?.trim() || "ช่าง (ลิงก์)") : null,
    [atCol]: marked ? new Date().toISOString() : null,
  };
  const sb = createServiceClient() as unknown as { from: (t: string) => any };
  const { error } = await sb.from("production_sets").update(patch).eq("id", body.set_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
