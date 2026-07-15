import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Icon from "@/components/Icon";
import PrintButton from "./PrintButton";

export const dynamic = "force-dynamic";

const DOW = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const TH_MONTH = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
function thFullDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return `วัน${DOW[d.getDay()]}ที่ ${d.getDate()} ${TH_MONTH[d.getMonth()]} ${d.getFullYear() + 543}`;
}

type Site = {
  id: string; site_no: number; customer_name: string; appointment_time: string;
  address: string | null; phone: string | null;
};
type Team = {
  id: string; start_time: string; note: string; member_ids: string[];
  leader: { name: string } | null;
  crew_team_sites: Site[];
};

// ฟอร์มพิมพ์ A4 แผนจัดทีมช่างประจำวัน — การ์ดทีม 2 คอลัมน์ สูงยืดตามเนื้อหา เต็มหน้าอัตโนมัติ (CSS print, ไม่ใช้ jsPDF)
export default async function CrewTeamsPrintPage({ searchParams }: { searchParams?: { date?: string } }) {
  const date = searchParams?.date ?? "";
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const supabase = createClient();

  let teams: Team[] = [];
  let nameById = new Map<string, string>();
  if (validDate) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const [teamsR, peopleR] = await Promise.all([
      sb.from("crew_day_teams")
        .select("id, start_time, note, member_ids, leader:crew_people(name), crew_team_sites(*)")
        .eq("work_date", date)
        .order("sort_order", { ascending: true }),
      sb.from("crew_people").select("id, name"),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    teams = ((teamsR.data ?? []) as any[]).map((t) => ({
      ...t,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      crew_team_sites: (t.crew_team_sites ?? []).slice().sort((a: Site, b: Site) => a.site_no - b.site_no),
    })) as Team[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    nameById = new Map(((peopleR.data ?? []) as any[]).map((p) => [p.id, p.name]));
  }

  const memberNames = (t: Team) => t.member_ids.map((id) => nameById.get(id)).filter(Boolean).join(", ");

  return (
    <div className="min-h-dvh bg-gray-100 print:bg-white">
      {/* แถบเครื่องมือ — ไม่พิมพ์ */}
      <div className="no-print sticky top-0 z-10 bg-white border-b px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        <Link href="/installation" className="press inline-flex items-center gap-1.5 text-sm text-ink-2">
          <Icon name="arrowLeft" size={16} /> กลับ
        </Link>
        <PrintButton />
      </div>

      {!validDate || teams.length === 0 ? (
        <div className="no-print mx-auto mt-8 max-w-[210mm] text-center text-sm text-gray-500 px-4">
          {!validDate ? "ไม่ได้ระบุวันที่ที่ถูกต้อง (?date=YYYY-MM-DD)" : `วันที่ ${thFullDate(date)} ยังไม่มีการจัดทีมช่าง`}
        </div>
      ) : (
        /* กระดาษ A4 — เนื้อหายืดได้เกิน 297mm ได้ (ไม่ตั้ง overflow/height ตายตัว) browser จะแบ่งหน้าพิมพ์เองตาม @page A4 */
        <div className="mx-auto my-6 bg-white shadow-lg print:shadow-none print:my-0" style={{ width: "210mm", minHeight: "297mm", padding: "14mm" }}>
          <div className="flex items-center justify-between mb-4" style={{ borderBottom: "2px solid #b3151d", paddingBottom: 10 }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#b3151d" }}>แผนจัดทีมช่างประจำวัน</div>
              <div style={{ fontSize: 13, color: "#4b5563", marginTop: 2 }}>{thFullDate(date)}</div>
            </div>
            <div style={{ fontSize: 12, color: "#6b7280", textAlign: "right" }}>
              JR ALUMINIUM<br />จำนวนทีม {teams.length} ทีม
            </div>
          </div>

          <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", columnGap: 8, rowGap: 8 }}>
            {teams.map((t, i) => (
              <div key={t.id} style={{ breakInside: "avoid", border: "1px solid #9ca3af", borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#1f2937", marginBottom: 4 }}>
                  ทีม {i + 1}{t.leader?.name ? ` · หัวหน้า ${t.leader.name}` : ""}
                </div>
                <div style={{ fontSize: 12, color: "#374151", marginBottom: 5 }}>
                  เวลาเริ่มงาน <b>{t.start_time || "—"}</b>
                </div>
                {t.crew_team_sites.length > 0 && (
                  <div style={{ marginBottom: 5 }}>
                    {t.crew_team_sites.map((s) => (
                      <div key={s.id} style={{ fontSize: 11.5, marginBottom: 3, paddingLeft: 6, borderLeft: "2px solid #e5e7eb" }}>
                        <div style={{ fontWeight: 600, color: "#1f2937" }}>
                          {s.site_no}. {s.customer_name || "—"}{s.appointment_time ? ` (นัด ${s.appointment_time})` : ""}
                        </div>
                        {(s.address || s.phone) && (
                          <div style={{ color: "#6b7280" }}>{s.address}{s.address && s.phone ? " · " : ""}{s.phone ? `โทร ${s.phone}` : ""}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ fontSize: 11.5, color: "#374151" }}>
                  ลูกทีม: {memberNames(t) || "—"}
                </div>
                {t.note && (
                  <div style={{ fontSize: 11, color: "#92400e", marginTop: 4, background: "#fef3c7", borderRadius: 4, padding: "2px 6px" }}>
                    หมายเหตุ: {t.note}
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
