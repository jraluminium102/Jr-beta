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

const thBase: React.CSSProperties = {
  border: "1px solid #000", verticalAlign: "top", padding: "7px 6px",
  textAlign: "center", fontWeight: 700, textDecoration: "underline", fontSize: 14,
};
const tdBase: React.CSSProperties = { border: "1px solid #000", verticalAlign: "top", padding: "6px 8px", fontSize: 14, lineHeight: 1.55 };
const numBadge: React.CSSProperties = {
  display: "inline-grid", placeItems: "center", width: 20, height: 20,
  border: "1.6px solid " + RED, color: RED, borderRadius: "50%", fontSize: 12, fontWeight: 700,
  marginRight: 7, verticalAlign: "middle",
};

// เรนเดอร์ 1 คอลัมน์แบบแบน — group=หัวข้อตัวหนา+เลข · spec=บุลเลท (สี/ไฮไลต์ต่อบรรทัด)
function ColumnCell({ lines, defaultColor = "#000" }: { lines: CoverLine[]; defaultColor?: string }) {
  const rows = (lines ?? []).filter((l) => (l.text ?? "").trim() || l.kind === "group");
  if (rows.length === 0) return null;
  return (
    <div>
      {rows.map((l, i) =>
        l.kind === "group" ? (
          <div key={i} style={{ fontWeight: 700, marginTop: i === 0 ? 0 : 6, marginBottom: 2 }}>
            <span style={numBadge}>{l.n}</span>{l.text}
          </div>
        ) : (
          <div key={i} style={{ padding: "1px 0", color: l.color ? COLOR_HEX[l.color] : defaultColor, background: l.hl ? "#fff35b" : undefined }}>
            - {l.text}
          </div>
        )
      )}
    </div>
  );
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
        <div className="mx-auto my-6 bg-white shadow-lg print:shadow-none print:my-0" style={{ width: "210mm", minHeight: "120mm", padding: "12mm" }}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ width: 110 }} />
            <div style={{ fontSize: 20 }}>
              <span style={{ fontWeight: 700 }}>ชื่อลูกค้า</span>{" "}
              <span style={{ fontWeight: 700, margin: "0 6px" }}>{job.customer_name || "—"}</span>
            </div>
            <div style={{ color: RED, fontWeight: 700, fontSize: 16, whiteSpace: "nowrap" }}>
              {showFloor ? `พื้นช่าง ${content.floorNote?.trim() || "................"}` : ""}
            </div>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: "44%" }} />
              <col style={{ width: "28%" }} />
              <col style={{ width: "28%" }} />
            </colgroup>
            <thead>
              <tr>
                <th style={{ ...thBase, color: "#000" }}>รายละเอียด สั่งของเตรียมผลิต</th>
                <th style={{ ...thBase, color: RED }}>รายละเอียด แจ้งช่างตอนติดตั้ง</th>
                <th style={{ ...thBase, color: RED }}>รายละเอียดแจ้งลูกค้า + เตรียมของติดตั้ง</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={tdBase}><ColumnCell lines={content.left} /></td>
                <td style={tdBase}><ColumnCell lines={content.mid} defaultColor={RED} /></td>
                <td style={tdBase}><ColumnCell lines={content.right} /></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
