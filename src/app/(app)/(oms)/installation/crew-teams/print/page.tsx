import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { redirect } from "next/navigation";
import Icon from "@/components/Icon";
import PrintButton from "./PrintButton";

export const dynamic = "force-dynamic";

const DOW = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const TH_MONTH = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
function thFullDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return `วัน${DOW[d.getDay()]}ที่ ${d.getDate()} ${TH_MONTH[d.getMonth()]} ${d.getFullYear() + 543}`;
}
// วันที่แบบสั้นบนหัวการ์ด (ตามฟอร์ม SetTeam) เช่น "ศุกร์ 17 กรกฎาคม 2569"
function thCardDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return `${DOW[d.getDay()]} ${d.getDate()} ${TH_MONTH[d.getMonth()]} ${d.getFullYear() + 543}`;
}

type Site = {
  id: string; site_no: number; customer_name: string; appointment_time: string; off_board?: boolean;
  address: string | null; phone: string | null;
};
type Team = {
  id: string; note: string; member_ids: string[]; start_time: string;
  leader: { name: string } | null;
  crew_team_sites: Site[];
};

// ฟอร์มพิมพ์ A4 แผนจัดทีมช่างประจำวัน — การ์ดทีม 2 คอลัมน์ สูงยืดตามเนื้อหา เต็มหน้าอัตโนมัติ (CSS print, ไม่ใช้ jsPDF)
export default async function CrewTeamsPrintPage({ searchParams }: { searchParams?: { date?: string } }) {
  // ⚠ Server Component ไม่ผ่านชั้น BFF → ต้องเช็คสิทธิ์เองที่นี่ (QA CRITICAL 16 ก.ค.69:
  //   เดิมไม่เช็คเลย + RLS อ่านได้ทุก active user → role ไหนก็พิมพ์ URL ตรงมาดูชื่อ/ที่อยู่/เบอร์ลูกค้าได้)
  const profile = await getProfile();
  if (!profile || !can(profile.role, "installation", "read")) redirect("/");

  const date = searchParams?.date ?? "";
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const supabase = createClient();

  let teams: Team[] = [];
  let nameById = new Map<string, string>();
  let loadError = "";
  if (validDate) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const [teamsR, peopleR] = await Promise.all([
      sb.from("crew_day_teams")
        .select("id, note, member_ids, start_time, leader:crew_people(name), crew_team_sites(*)")
        .eq("work_date", date)
        .order("sort_order", { ascending: true }),
      sb.from("crew_people").select("id, name"),
    ]);
    // แยก "วันว่างจริง" ออกจาก "อ่านข้อมูลไม่ได้" — เดิมกลืน error แล้วโชว์ "ยังไม่มีการจัดทีม"
    // = ข้อความหลอกที่ดูสมจริง คนปริ้นจะเชื่อว่าวันนั้นไม่มีทีม (คลาสเดียวกับหน้าผลิตโชว์ 0)
    if (teamsR.error) {
      loadError = /crew_day_teams|crew_people|does not exist|42P01/i.test(teamsR.error.message ?? "")
        ? "ยังไม่ได้รัน migration 0097 (จัดทีมช่างรายวัน) — รันก่อนใช้งาน"
        : "อ่านข้อมูลจัดทีมไม่สำเร็จ — ลองรีเฟรช (อย่าเพิ่งเชื่อว่าวันนี้ไม่มีทีม)";
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    teams = ((teamsR.data ?? []) as any[]).map((t) => ({
      ...t,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      crew_team_sites: (t.crew_team_sites ?? []).slice().sort((a: Site, b: Site) => a.site_no - b.site_no),
    })) as Team[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    nameById = new Map(((peopleR.data ?? []) as any[]).map((p) => [p.id, p.name]));
  }

  const memberNames = (t: Team) => t.member_ids.map((id) => nameById.get(id)).filter(Boolean).join("  ");

  return (
    <div className="min-h-dvh bg-gray-100 print:bg-white">
      {/* แถบเครื่องมือ — ไม่พิมพ์ */}
      <div className="no-print sticky top-0 z-10 bg-white border-b px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        <Link href="/installation" className="press inline-flex items-center gap-1.5 text-sm text-ink-2">
          <Icon name="arrowLeft" size={16} /> กลับ
        </Link>
        <PrintButton />
      </div>

      {loadError ? (
        <div role="alert" className="no-print mx-auto mt-8 max-w-[210mm] text-center text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          {loadError}
        </div>
      ) : !validDate || teams.length === 0 ? (
        <div className="no-print mx-auto mt-8 max-w-[210mm] text-center text-sm text-gray-500 px-4">
          {!validDate ? "ไม่ได้ระบุวันที่ที่ถูกต้อง (?date=YYYY-MM-DD)" : `วันที่ ${thFullDate(date)} ยังไม่มีการจัดทีมช่าง`}
        </div>
      ) : (
        /* ฟอร์มการ์ดต่อทีม (แบบ SetTeam) — ปริ้นแล้วตัดแยกแจกช่างได้ทีละใบ · แต่ละการ์ดมีวันที่+เวลาในตัว
           A4 2 คอลัมน์ · เนื้อหายืดเกิน 297mm ได้ browser แบ่งหน้าเอง */
        <div className="mx-auto my-6 bg-white shadow-lg print:shadow-none print:my-0" style={{ width: "210mm", minHeight: "297mm", padding: "10mm" }}>
          <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", columnGap: 10, rowGap: 10 }}>
            {teams.map((t) => (
              <div key={t.id} style={{ breakInside: "avoid", border: "1.5px solid #4b5563", borderRadius: 6, padding: "10px 12px", minHeight: 120 }}>
                {/* หัวการ์ด: วันที่ (ซ้าย) · เวลา (ขวา แดงหนา) */}
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, borderBottom: "1px solid #e5e7eb", paddingBottom: 5, marginBottom: 6 }}>
                  <span style={{ fontSize: 12.5, color: "#374151" }}>{thCardDate(date)}</span>
                  {t.start_time && <span style={{ fontSize: 16, fontWeight: 800, color: "#e11d1d", textDecoration: "underline", whiteSpace: "nowrap" }}>{t.start_time}</span>}
                </div>
                {/* รายการลูกค้า (เลขข้อ) — ไม่มีที่อยู่/เบอร์ ตามฟอร์ม */}
                <div style={{ marginBottom: 6 }}>
                  {t.crew_team_sites.length > 0
                    ? t.crew_team_sites.map((s, i) => (
                      <div key={s.id} style={{ fontSize: 14, fontWeight: 600, color: "#111827", lineHeight: 1.45 }}>
                        {i + 1}. {s.customer_name || "—"}
                      </div>
                    ))
                    : <div style={{ fontSize: 13, color: "#9ca3af" }}>— ยังไม่ระบุงาน —</div>}
                </div>
                {/* หัวหน้าทีม (ตัวหนา) แล้วตามด้วยลูกทีม */}
                {t.leader?.name && <div style={{ fontSize: 15, fontWeight: 800, color: "#111827", marginBottom: 2 }}>{t.leader.name}</div>}
                <div style={{ fontSize: 13, color: "#1f2937", lineHeight: 1.5 }}>{memberNames(t) || "—"}</div>
                {t.note && (
                  <div style={{ fontSize: 11, color: "#92400e", marginTop: 5, background: "#fef3c7", borderRadius: 4, padding: "2px 6px" }}>
                    {t.note}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
