import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import Icon from "@/components/Icon";
import PrintButton from "./PrintButton";
import { EMPTY_CONTENT, type CoverColor, type CoverContent, type CoverLine } from "@/lib/cover-sheet/types";

export const dynamic = "force-dynamic";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySb = { from: (t: string) => any };

const COLOR_HEX: Record<CoverColor, string> = { "": "#000", red: "#c00000", blue: "#1a56db", green: "#15803d" };
const RED = "#c00000";

// ฟอร์มเส้นบรรทัด (แบบใบจริง): เส้นสีเทาบาง ต่อเนื่องเต็มหน้า · ไม่ตีกรอบทึบ · เผื่อเขียนมือด้วยดินสอ
const RULE = "0.7px solid #9a9a9a";
const ROW_H = "7.2mm";       // ความสูงบรรทัด (ให้เต็ม A4)
const MIN_ROWS = 34;         // จำนวนบรรทัดขั้นต่ำ (เติมเส้นว่างจนเต็มหน้า)
const thRuled: React.CSSProperties = {
  borderBottom: "1.4px solid #000", borderRight: RULE, verticalAlign: "bottom", padding: "4px 6px 6px",
  textAlign: "center", fontWeight: 700, textDecoration: "underline", fontSize: 14,
};
const cellBase: React.CSSProperties = { borderBottom: RULE, borderRight: RULE, verticalAlign: "top", padding: "2px 7px", height: ROW_H, fontSize: 14, lineHeight: 1.3, overflow: "hidden" };
const numBadge: React.CSSProperties = {
  display: "inline-grid", placeItems: "center", width: 19, height: 19,
  border: "1.6px solid " + RED, color: RED, borderRadius: "50%", fontSize: 12, fontWeight: 700,
  marginRight: 6, verticalAlign: "middle",
};

// เรนเดอร์ 1 บรรทัดในเซลล์ — group=หัวข้อตัวหนา+เลข · spec=บุลเลท (สี/ไฮไลต์) · ว่าง=เส้นเปล่า
function LineCell({ line, defaultColor = "#000" }: { line?: CoverLine; defaultColor?: string }) {
  if (!line) return <>&nbsp;</>;
  if (line.kind === "group") return <span style={{ fontWeight: 700 }}><span style={numBadge}>{line.n}</span>{line.text}</span>;
  return <span style={{ color: line.color ? COLOR_HEX[line.color] : defaultColor, background: line.hl ? "#fff35b" : undefined }}>- {line.text}</span>;
}

export default async function CoverSheetPrintPage({ params }: { params: { jobId: string } }) {
  // ⚠ Server Component ไม่ผ่านชั้น BFF → ต้องเช็คสิทธิ์เอง (บทเรียน crew-teams print)
  const profile = await getProfile();
  if (!profile || !can(profile.role, "production", "read")) redirect("/");

  const jobId = params.jobId;
  const sb = createClient() as unknown as AnySb;
  const [jobR, coverR] = await Promise.all([
    sb.from("jobs").select("job_code, customer_name, floor_work, floor_note").eq("id", jobId).maybeSingle(),
    sb.from("cover_sheets").select("content").eq("job_id", jobId).maybeSingle(),
  ]);

  const job = jobR.data as { job_code: string; customer_name: string; floor_work: string | null } | null;
  const cover = coverR.data as { content: CoverContent } | null;
  const content: CoverContent = cover?.content ?? EMPTY_CONTENT;
  const showFloor = !!job?.floor_work && job.floor_work !== "none";

  return (
    <div className="min-h-dvh bg-gray-100 print:bg-white">
      <div className="no-print sticky top-0 z-10 bg-white border-b px-4 py-3 flex items-center justify-between">
        <Link href={job ? `/cover-sheet/${jobId}` : "/production"} className="press inline-flex items-center gap-1.5 text-sm text-ink-2">
          <Icon name="arrowLeft" size={16} /> กลับ
        </Link>
        <PrintButton />
      </div>

      {!job ? (
        <div className="no-print mx-auto mt-8 max-w-[210mm] text-center text-sm text-gray-500 px-4">ไม่พบงานนี้</div>
      ) : !cover ? (
        <div className="no-print mx-auto mt-8 max-w-[210mm] text-center text-sm text-gray-500 px-4">งานนี้ยังไม่มีใบปะหน้า — กลับไปสร้าง/บันทึกก่อนพิมพ์</div>
      ) : (
        (() => {
          const flat = (arr?: CoverLine[]) => (arr ?? []).filter((l) => (l.text ?? "").trim() || l.kind === "group");
          const lf = flat(content.left), mf = flat(content.mid), rf = flat(content.right);
          const rows = Math.max(lf.length, mf.length, rf.length, MIN_ROWS);
          const warns = (content.warnings ?? []).filter((w) => w.trim());
          const firstCell = { ...cellBase, borderLeft: RULE };
          return (
        <div className="mx-auto my-6 bg-white shadow-lg print:shadow-none print:my-0" style={{ width: "210mm", minHeight: "277mm", padding: "10mm" }}>
          {/* หัว: grid 3 ช่อง (ซ้าย/ขวา 1fr เท่ากัน → ชื่อลูกค้า auto อยู่กลางหน้าจริง · หัวสูงขยายตามคำเตือน ไม่ล้นทับตาราง) */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "start", columnGap: 12, marginBottom: 8 }}>
            {/* ซ้าย: คำเตือน */}
            <div style={{ color: RED, fontWeight: 700, lineHeight: 1.3, justifySelf: "start" }}>
              {warns.length > 0 && (
                <>
                  <div style={{ fontSize: 14 }}>*ระวัง อลูฯ / กระจก / มุ้ง ผิด*</div>
                  {warns.map((w, i) => <div key={i} style={{ fontSize: 13 }}>⚠ {w}</div>)}
                </>
              )}
            </div>
            {/* กลาง: ชื่อลูกค้า */}
            <div style={{ fontSize: 20, textAlign: "center", whiteSpace: "nowrap", paddingTop: 4 }}>
              <span style={{ fontWeight: 700 }}>ชื่อลูกค้า</span>{" "}
              <span style={{ fontWeight: 700 }}>{job.customer_name || "—"}</span>
            </div>
            {/* ขวา: งานพื้น (โชว์เมื่อกรอกไว้) */}
            <div style={{ color: RED, fontWeight: 700, fontSize: 15, textAlign: "right", justifySelf: "end", paddingTop: 4, whiteSpace: "pre-wrap", maxWidth: 240 }}>
              {content.floorNote?.trim() ? `งานพื้น ${content.floorNote.trim()}` : ""}
            </div>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", borderTop: RULE }}>
            <colgroup>
              <col style={{ width: "44%" }} />
              <col style={{ width: "28%" }} />
              <col style={{ width: "28%" }} />
            </colgroup>
            <thead>
              <tr>
                <th style={{ ...thRuled, borderLeft: RULE, color: "#000" }}>รายละเอียด สั่งของเตรียมผลิต</th>
                <th style={{ ...thRuled, color: RED }}>รายละเอียด แจ้งช่างตอนติดตั้ง</th>
                <th style={{ ...thRuled, color: RED }}>รายละเอียดแจ้งลูกค้า + เตรียมของติดตั้ง</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: rows }).map((_, i) => (
                <tr key={i}>
                  <td style={firstCell}><LineCell line={lf[i]} /></td>
                  <td style={cellBase}><LineCell line={mf[i]} defaultColor={RED} /></td>
                  <td style={cellBase}><LineCell line={rf[i]} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
          );
        })()
      )}
    </div>
  );
}
