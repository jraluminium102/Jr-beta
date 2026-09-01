import { dbMessage } from "@/lib/bff/db-error";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";
import { cutInputFromRecipe } from "@/lib/cutlist/from-recipe";
import { cutlistActor } from "@/lib/cutlist/actor";
import { pickJobQuotation } from "@/lib/cover-sheet/pick-quotation";

export const dynamic = "force-dynamic";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = { from: (t: string) => any };

// GET /api/cutlists[?job_id=] → รายการใบตัด (ล่าสุดก่อน) + งาน/ลูกค้า
//   job_id: เฉพาะใบตัดของงานนั้น — ใช้โชว์ใบตัดในหน้างาน/ลูกค้า (ไม่ต้องไปหาในเมนูใบตัด)
export async function GET(req: Request) {
  const actor = await cutlistActor(req);
  if (!actor) return UNAUTHORIZED();
  const jobId = new URL(req.url).searchParams.get("job_id");
  const sb = actor.sb as unknown as Sb;
  let qy = sb
    .from("cutlists")
    .select("id, code, name, status, job_id, created_at, stock_cut_at, jobs:job_id(job_code, customer_name)");
  if (jobId) qy = qy.eq("job_id", jobId);
  const { data, error } = await qy
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return fail(dbMessage(error, "โหลดรายการใบตัดไม่สำเร็จ"), 500);
  return ok(data);
}

// POST /api/cutlists → สร้างใบตัด
//   { job_id?, name?, from_job?: true }
//   from_job: ดึงข้อจากใบเสนอล่าสุดของงาน (calc_recipe 0093) → map เป็นข้อใบตัดอัตโนมัติ
//   ข้อที่ map ไม่ได้ (รุ่นยังไม่มีสูตรตัด/พิมพ์มือ/G6) → ข้าม + ส่งชื่อกลับใน meta.skipped
export async function POST(req: Request) {
  const actor = await cutlistActor(req);
  if (!actor) return UNAUTHORIZED();
  if (!actor.canWrite) return FORBIDDEN();

  const body = await req.json().catch(() => null);
  if (!body) return fail("payload ไม่ถูกต้อง");
  const jobId = body.job_id ? String(body.job_id) : null;
  // ใบตัดไม่ผูกงานลูกค้า (งานเบิกทั่วไป) → บังคับตั้งชื่อ (กันใบเปล่านิรนามในรายงาน · เจ้าของสั่ง 22 ก.ค.69)
  if (!jobId && !String(body.name ?? "").trim()) return fail('ใบตัดที่ไม่ผูกงานลูกค้า ต้องตั้งชื่อก่อน (เช่น "เบิกเส้นซ่อมหน้างาน")');

  const sb = actor.sb as unknown as Sb;

  // ชื่อใบตัดตั้งต้น: ชื่อลูกค้าจากงาน (ถ้ามี)
  let jobName = "";
  if (jobId) {
    const { data: j } = await sb.from("jobs").select("customer_name, job_code").eq("id", jobId).maybeSingle();
    if (!j) return fail("ไม่พบงาน", 404);
    jobName = `${j.customer_name ?? ""}${j.job_code ? ` (${j.job_code})` : ""}`;
  }

  // from_job: ดึงข้อจากใบเสนอล่าสุด (ไม่ cancelled) ของงาน
  type NewItem = { spec_id: string; label: string; input: Record<string, unknown>; sets: number; sort_order: number };
  const items: NewItem[] = [];
  const skipped: string[] = [];
  if (body.from_job && jobId) {
    // เลือก "ใบเสนอที่ใช้จริง" (ใบที่มีบิล/มัดจำ) ตัวเดียวกับใบปะหน้า — กันแต่ละหน้าเลือกคนละออเดอร์ (30 ส.ค.69)
    const picked = await pickJobQuotation(sb, jobId);
    const { data: q } = picked ? await sb
      .from("quotations")
      .select("id, code, quotation_items(*)")
      .eq("id", picked.id)
      .maybeSingle() : { data: null };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const qItems = ((q?.quotation_items ?? []) as any[]).slice().sort((a, b) => a.sort_order - b.sort_order);
    for (const it of qItems) {
      if ((it.category ?? "") === "ค่าบริการ") continue; // ค่าบริการไม่ใช่งานตัด
      const m = cutInputFromRecipe(it.calc_recipe);
      if (m) {
        items.push({
          spec_id: m.spec_id,
          label: String(it.name ?? "").slice(0, 200),
          input: m.input as Record<string, unknown>,
          // sets = จำนวนชุดในใบเสนอ × multiplier (เช่น Velora: ใบตัด 1 บาน/ชุด สั่ง N บาน → ×N — QA HIGH)
          sets: Math.max(1, Math.round((Number(it.qty) || 1) * (m.multiplier ?? 1))),
          sort_order: items.length,
        });
      } else {
        skipped.push(String(it.name ?? "(ไม่มีชื่อ)"));
      }
    }
  }

  const { data: cl, error: clErr } = await sb
    .from("cutlists")
    .insert({
      job_id: jobId,
      name: String(body.name ?? "").trim() || (jobName ? `ใบตัด — ${jobName}` : "ใบตัดใหม่"),
      note: "",
      created_by: actor.kind === "user" ? actor.userId : null,
    })
    .select("id")
    .single();
  if (clErr || !cl) return fail(dbMessage(clErr, "สร้างใบตัดไม่สำเร็จ"), 500);

  // code = CL-<id> (ใช้เป็น ref ตอนตัดสต็อก)
  await sb.from("cutlists").update({ code: `CL-${cl.id}` }).eq("id", cl.id);

  if (items.length) {
    const rows = items.map((it) => ({ ...it, cutlist_id: cl.id }));
    const { error: iErr } = await sb.from("cutlist_items").insert(rows);
    if (iErr) {
      await sb.from("cutlists").delete().eq("id", cl.id);
      return fail(dbMessage(iErr, "บันทึกข้อใบตัดไม่สำเร็จ"), 500);
    }
  }

  return ok({ id: cl.id, code: `CL-${cl.id}`, item_count: items.length, skipped }, 201);
}
