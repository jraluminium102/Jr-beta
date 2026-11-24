import { z } from "zod";
import { randomUUID } from "node:crypto";
import { requirePermission, HttpError } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";
import { createServiceClient } from "@/lib/supabase/admin";
import { LEDGER_KINDS, loadLedgerAdjust, mergeJobAdj, saveLedgerAdjust, type LedgerManual } from "@/lib/stats-ledger";

export const dynamic = "force-dynamic";
type Sb = { from: (t: string) => any };

/**
 * แก้สมุดบัญชี (ยอดมัดจำ) ในหน้าสถิติด้วยมือ (เจ้าของ 24 พ.ย.69) — เก็บใน app_config.stats_ledger_adjust
 *   PATCH  { job_id, net?, deposit?, onsite?, excluded? }  แก้ค่าของงานในระบบ (null = กลับไปใช้ค่าที่ระบบคิด)
 *   POST   { ...รายการใหม่ }                                เพิ่มรายการที่ไม่มีในระบบ
 *   PUT    { id, ...ช่องที่แก้ }                             แก้รายการที่เพิ่มเอง
 *   DELETE ?id=                                            ลบรายการที่เพิ่มเอง
 *   มีผลเฉพาะตัวเลขหน้าสถิติ ไม่แตะงาน/บิล/การเงินจริง · สิทธิ์ = finance:write (เท่ากับแก้เป้า)
 */
const money = z.number().min(0).max(1_000_000_000);
const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "วันที่ต้องเป็น ปปปป-ดด-วว").refine((s) => !Number.isNaN(Date.parse(s + "T00:00:00Z")), "วันที่ไม่ถูกต้อง");

const jobPatch = z.object({
  job_id: z.string().uuid(),
  net: money.nullable().optional(),
  deposit: money.nullable().optional(),
  onsite: z.boolean().nullable().optional(),
  excluded: z.boolean().optional(),
});
const manualFields = {
  customer_name: z.string().trim().min(1, "กรอกชื่อลูกค้า").max(200),
  line: z.string().trim().max(200),
  deposit_date: iso,
  assess_date: iso.nullable(),
  deposit: money, net: money, fee: money,
  vat: z.boolean(),
  kind: z.enum(LEDGER_KINDS),
  sales: z.string().trim().max(80),
  onsite: z.boolean(),
  note: z.string().trim().max(500),
};
const manualCreate = z.object({
  ...manualFields,
  line: manualFields.line.default(""), assess_date: manualFields.assess_date.default(null), fee: manualFields.fee.default(0),
  vat: manualFields.vat.default(false), kind: manualFields.kind.default("NEW"), sales: manualFields.sales.default(""),
  onsite: manualFields.onsite.default(false), note: manualFields.note.default(""),
});
const manualUpdate = z.object({ id: z.string().min(1).max(80) }).merge(z.object(manualFields).partial());

const svc = () => createServiceClient() as unknown as Sb;

export const PATCH = withRoute(async (req: Request) => {
  const ctx = await requirePermission("finance", "write");
  const body = jobPatch.parse(await req.json());
  const sb = svc();
  const { data: job, error } = await sb.from("jobs").select("id").eq("id", body.job_id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!job) throw new HttpError(404, "ไม่พบงานนี้");
  const adj = await loadLedgerAdjust(sb);
  const next = mergeJobAdj(adj.jobs[body.job_id], body);
  if (next) adj.jobs[body.job_id] = { ...next, at: new Date().toISOString(), by: ctx.user.id };
  else delete adj.jobs[body.job_id];
  await saveLedgerAdjust(sb, adj);
  return ok({ job_id: body.job_id, adjust: adj.jobs[body.job_id] ?? null });
});

export const POST = withRoute(async (req: Request) => {
  const ctx = await requirePermission("finance", "write");
  const body = manualCreate.parse(await req.json());
  const sb = svc();
  const adj = await loadLedgerAdjust(sb);
  const row: LedgerManual = { id: randomUUID(), ...body, at: new Date().toISOString(), by: ctx.user.id };
  adj.manual.push(row);
  await saveLedgerAdjust(sb, adj);
  return ok(row);
});

export const PUT = withRoute(async (req: Request) => {
  const ctx = await requirePermission("finance", "write");
  const { id, ...fields } = manualUpdate.parse(await req.json());
  const sb = svc();
  const adj = await loadLedgerAdjust(sb);
  const i = adj.manual.findIndex((m) => m.id === id);
  if (i < 0) throw new HttpError(404, "ไม่พบรายการนี้ (อาจถูกลบไปแล้ว)");
  adj.manual[i] = { ...adj.manual[i], ...fields, at: new Date().toISOString(), by: ctx.user.id };
  await saveLedgerAdjust(sb, adj);
  return ok(adj.manual[i]);
});

export const DELETE = withRoute(async (req: Request) => {
  await requirePermission("finance", "write");
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const sb = svc();
  const adj = await loadLedgerAdjust(sb);
  const before = adj.manual.length;
  adj.manual = adj.manual.filter((m) => m.id !== id);
  if (adj.manual.length === before) throw new HttpError(404, "ไม่พบรายการนี้ (อาจถูกลบไปแล้ว)");
  await saveLedgerAdjust(sb, adj);
  return ok({ id });
});
