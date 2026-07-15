import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { ok, err } from "@/lib/bff/response";

const Schema = z.object({ work_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

// POST /api/crew-day/import-from-calendar { work_date }
// ดึงแผนจากปฏิทินรายเดือน (install_assignments, 0086/0089) ของวันนั้น มา prefill เป็นทีม/สถานที่ในหน้าจัดทีมรายวัน
// — งานที่หัวหน้าช่างชื่อเดียวกัน (พิมพ์ตรงกัน) ในวันเดียวกัน → รวมเป็นทีมเดียว หลายสถานที่ (สูงสุด 4 จุด/ทีม)
// — พยายามจับคู่ชื่อหัวหน้ากับ crew_people (ชื่อไม่ตรง/ไม่มีในทะเบียน → ไม่ผูก leader_id ไว้ ใส่ชื่อในหมายเหตุแทน ให้ผู้ใช้เลือกเองจาก chip)
// — ⚠ ทิศทางข้อมูลเดียว: ปฏิทิน → รายวัน เท่านั้น (ดึงมาครั้งเดียว หลังจากนั้นแก้ในหน้ารายวันได้อิสระ ไม่ sync กลับปฏิทิน
//   เพราะ "แผน" กับ "ปฏิบัติจริง" ต่างกันได้เป็นปกติ — กันเลขตีกันสองทาง/เข้าใจง่ายกว่า)
// — idempotent แบบหยาบ: ข้ามงาน (job_id) ที่ถูก import ไปแล้วในวันนั้น (เช็คจาก crew_team_sites.job_id ที่ผูกกับทีมของวันนี้) กันกดซ้ำแล้วซ้อน
export const POST = withRoute(async (req: Request) => {
  const ctx = await requirePermission("installation", "write");
  const p = Schema.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return err(p.error.errors[0].message, 400);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = ctx.supabase as any;
  const date = p.data.work_date;

  const { data: asg, error: asgErr } = await sb
    .from("install_assignments")
    .select("job_id, lead_name, crew, jobs(customer_name, customer_tel, customer_area)")
    .eq("date", date);
  if (asgErr) return err(asgErr.message, 500);
  if (!asg || asg.length === 0) return ok({ created: 0, message: "วันนี้ไม่มีแผนในปฏิทินรายเดือน" });

  // ทีมของวันนี้ (ถ้ามีอยู่แล้ว) — ใช้เช็คกันซ้ำ + ต่อ sort_order
  const { data: existingTeams, error: existErr } = await sb
    .from("crew_day_teams").select("id, sort_order, crew_team_sites(job_id)")
    .eq("work_date", date);
  // ⚠ fail-closed: select กันซ้ำล้มแล้วเดินต่อ = alreadyImported ว่าง → กดซ้ำได้ทีมซ้ำทั้งวัน (audit เจอ 16 ก.ค.69)
  if (existErr) {
    return err(/crew_day_teams|does not exist|42P01/i.test(existErr.message ?? "")
      ? "ยังไม่ได้รัน migration 0097 (จัดทีมช่างรายวัน) — รันก่อนใช้งาน"
      : "อ่านทีมของวันนี้ไม่สำเร็จ — ลองใหม่ (กันนำเข้าซ้ำ)", 400);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const alreadyImported = new Set(((existingTeams ?? []) as any[]).flatMap((t) => (t.crew_team_sites ?? []).map((s: { job_id: string | null }) => s.job_id).filter(Boolean)));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let nextSort = Math.max(0, ...((existingTeams ?? []) as any[]).map((t) => t.sort_order ?? 0)) + 1;

  // เอาไว้จับคู่ชื่อหัวหน้า → crew_people
  const { data: leaders } = await sb.from("crew_people").select("id, name").eq("is_leader", true).eq("is_active", true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leaderByName = new Map(((leaders ?? []) as any[]).map((l) => [l.name.trim(), l.id]));
  const { data: members } = await sb.from("crew_people").select("id, name").eq("is_member", true).eq("is_active", true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const memberByName = new Map(((members ?? []) as any[]).map((m) => [m.name.trim(), m.id]));

  // group ตามชื่อหัวหน้า (trim) — ว่าง = แยกทีมทีละงาน
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const groups = new Map<string, any[]>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const a of asg as any[]) {
    if (alreadyImported.has(a.job_id)) continue; // กันนำเข้าซ้ำ
    const key = (a.lead_name || "").trim() || `__solo_${a.job_id}`;
    const g = groups.get(key) ?? [];
    g.push(a);
    groups.set(key, g);
  }
  if (groups.size === 0) return ok({ created: 0, message: "งานในวันนี้ถูกนำเข้าครบแล้ว" });

  let createdCount = 0;
  for (const [key, items] of groups) {
    const leadName = key.startsWith("__solo_") ? "" : key;
    const leaderId = leadName ? leaderByName.get(leadName) ?? null : null;
    // จับคู่ลูกทีมจากช่อง crew (พิมพ์อิสระ คั่นด้วย , จากปฏิทินเดิม) — เท่าที่ชื่อตรงกับทะเบียน
    const crewNames = [...new Set(items.flatMap((a) => (a.crew || "").split(",").map((s: string) => s.trim()).filter(Boolean)))];
    const matchedMemberIds = crewNames.map((n) => memberByName.get(n)).filter((v): v is string => !!v);
    const unmatchedCrew = crewNames.filter((n) => !memberByName.get(n));
    const noteParts: string[] = [];
    if (leadName && !leaderId) noteParts.push(`หัวหน้า (จากปฏิทิน ยังไม่ผูกชื่อ): ${leadName}`);
    if (unmatchedCrew.length) noteParts.push(`ลูกทีม (จากปฏิทิน ยังไม่ผูกชื่อ): ${unmatchedCrew.join(", ")}`);
    // ⚠ เกิน 4 จุด/ทีม ห้ามตัดทิ้งเงียบ (QA HIGH: งานหายจากใบปริ้น = ช่างพลาดหน้างานจริง)
    //   → จดชื่องานที่ไม่ได้ใส่ ลงหมายเหตุทีมให้เห็นชัด คนจัดจะได้แยกทีม/จัดมือเอง
    const dropped = items.slice(4);
    if (dropped.length) {
      noteParts.push(`⚠ เกิน 4 จุด — ยังไม่ได้ใส่: ${dropped.map((a) => a.jobs?.customer_name || a.job_id).join(", ")}`);
    }

    const { data: newTeam, error: teamErr } = await sb
      .from("crew_day_teams")
      .insert({
        work_date: date, sort_order: nextSort++,
        leader_id: leaderId, member_ids: matchedMemberIds,
        note: noteParts.join(" · "), created_by: ctx.user.id,
      })
      .select("id").single();
    if (teamErr) return err(teamErr.message, 500);

    const siteRows = items.slice(0, 4).map((a, i) => ({
      team_id: newTeam.id, site_no: i + 1, job_id: a.job_id,
      customer_name: a.jobs?.customer_name ?? "", appointment_time: "",
      address: a.jobs?.customer_area ?? null, phone: a.jobs?.customer_tel ?? null,
    }));
    const { error: siteErr } = await sb.from("crew_team_sites").insert(siteRows);
    if (siteErr) return err(siteErr.message, 500);
    createdCount++;
  }

  await audit({ userId: ctx.user.id, action: "CREW_DAY_IMPORT_FROM_CALENDAR", table: "crew_day_teams", newValue: { date, teams: createdCount } });
  return ok({ created: createdCount });
});
