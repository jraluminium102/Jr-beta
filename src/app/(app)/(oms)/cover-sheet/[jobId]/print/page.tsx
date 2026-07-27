import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import Icon from "@/components/Icon";
import PrintButton from "./PrintButton";
// generator ตัวจริง (pure JS ไม่มี type) — ใช้แค่ toShort สำหรับ render โหมดสั้น ห้ามแก้ logic
import { toShort } from "@/lib/cover-sheet/generate.mjs";
import { EMPTY_CONTENT, type CoverColor, type CoverContent, type CoverLine, type CoverMode } from "@/lib/cover-sheet/types";

export const dynamic = "force-dynamic";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySb = { from: (t: string) => any };

const COLOR_HEX: Record<CoverColor, string> = { "": "#000", red: "#c00000", blue: "#1a56db", green: "#15803d" };
const RED = "#c00000";

const thBase: React.CSSProperties = {
  border: "1px solid #000", verticalAlign: "top", padding: "7px 6px",
  textAlign: "center", fontWeight: 700, textDecoration: "underline", fontSize: 14,
};
const tdBase: React.CSSProperties = {
  border: "1px solid #000", verticalAlign: "top", padding: "5px 8px", fontSize: 14, lineHeight: 1.5,
};
const ulBase: React.CSSProperties = { margin: 0, padding: 0, listStyle: "none" };
const numBadge: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", width: 20, height: 20,
  border: "1.6px solid " + RED, color: RED, borderRadius: "50%", fontSize: 12, fontWeight: 700,
  marginRight: 7, verticalAlign: "middle",
};

// รายการบุลเลท 1 คอลัมน์ (สี/ไฮไลต์ต่อบรรทัด) — ใช้ร่วมทั้งคอลัมน์กลาง/ขวา/ในชุด (โหมดแยกตามชุด)
// defaultColor = สีเริ่มต้นเมื่อบรรทัดไม่ได้เลือกสี (คอลัมน์กลาง "แจ้งช่าง" = แดง ตามฟอร์มจริง · อื่น ๆ = ดำ)
function LineList({ lines, defaultColor = "#000" }: { lines: CoverLine[]; defaultColor?: string }) {
  const rows = (lines ?? []).filter((l) => (l.text ?? "").trim());
  if (rows.length === 0) return null;
  return (
    <ul style={ulBase}>
      {rows.map((l, i) => (
        <li key={i} style={{ padding: "1.5px 0", color: l.color ? COLOR_HEX[l.color] : defaultColor, background: l.hl ? "#fff35b" : undefined }}>
          - {l.text}
        </li>
      ))}
    </ul>
  );
}

export default async function CoverSheetPrintPage({ params }: { params: { jobId: string } }) {
  // ⚠ Server Component ไม่ผ่านชั้น BFF → ต้องเช็คสิทธิ์เอง (บทเรียน crew-teams print 16 ก.ค.69)
  const profile = await getProfile();
  if (!profile || !can(profile.role, "production", "read")) redirect("/");

  const jobId = params.jobId;
  const supabase = createClient();
  const sb = supabase as unknown as AnySb;

  const [jobR, coverR] = await Promise.all([
    sb.from("jobs").select("job_code, customer_name, floor_work, floor_note").eq("id", jobId).maybeSingle(),
    sb.from("cover_sheets").select("mode, content").eq("job_id", jobId).maybeSingle(),
  ]);

  const job = jobR.data as { job_code: string; customer_name: string; floor_work: string | null; floor_note: string | null } | null;
  const cover = coverR.data as { mode: CoverMode; content: CoverContent } | null;
  const mode: CoverMode = cover?.mode ?? "short";
  const content: CoverContent = cover?.content ?? EMPTY_CONTENT;
  const showFloor = !!job?.floor_work && job.floor_work !== "none";
  const groups = content.groups ?? [];
  const shortLines = mode === "short" ? toShort(groups) : [];

  return (
    <div className="min-h-dvh bg-gray-100 print:bg-white">
      {/* แถบเครื่องมือ — ไม่พิมพ์ */}
      <div className="no-print sticky top-0 z-10 bg-white border-b px-4 py-3 flex items-center justify-between">
        <Link href={job ? `/cover-sheet/${jobId}` : "/production"} className="press inline-flex items-center gap-1.5 text-sm text-ink-2">
          <Icon name="arrowLeft" size={16} /> กลับ
        </Link>
        <PrintButton />
      </div>

      {!job ? (
        <div className="no-print mx-auto mt-8 max-w-[210mm] text-center text-sm text-gray-500 px-4">ไม่พบงานนี้</div>
      ) : !cover ? (
        <div className="no-print mx-auto mt-8 max-w-[210mm] text-center text-sm text-gray-500 px-4">
          งานนี้ยังไม่มีใบปะหน้า — กลับไปสร้าง/บันทึกก่อนพิมพ์
        </div>
      ) : (
        <div className="mx-auto my-6 bg-white shadow-lg print:shadow-none print:my-0" style={{ width: "210mm", minHeight: "120mm", padding: "12mm" }}>
          {/* หัว: ชื่อลูกค้ากลาง + พื้นช่างมุมขวาบน */}
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
              {mode === "grouped" && groups.length > 0 ? (
                // ไม่ใช้ rowSpan (กันแถวถูกตัดข้ามหน้า A4 — บทเรียน quote-print-pagination)
                // โน้ตช่าง/ลูกค้าโชว์แถวแรก แถวถัดไปเว้นว่าง
                groups.map((g, gi) => (
                  <tr key={gi} style={{ breakInside: "avoid" }}>
                    <td style={tdBase}>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>
                        <span style={numBadge}>{g.n}</span>{g.title}
                      </div>
                      <LineList lines={g.lines} />
                    </td>
                    <td style={tdBase}>{gi === 0 ? <LineList lines={content.midLines} defaultColor={RED} /> : null}</td>
                    <td style={tdBase}>{gi === 0 ? <LineList lines={content.rightLines} /> : null}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td style={tdBase}>
                    {mode === "short" ? (
                      shortLines.length === 0 ? (
                        <span style={{ color: "#9ca3af" }}>— ยังไม่มีรายการ —</span>
                      ) : (
                        <ul style={ulBase}>
                          {shortLines.map((s, i) => (
                            <li key={i} style={{ padding: "1.5px 0", color: s.color ? COLOR_HEX[s.color as CoverColor] : "#000", background: s.hl ? "#fff35b" : undefined }}>
                              - {s.text}
                              {s.ref && <span style={{ color: "#0a58ca", fontSize: 12 }}> ({s.ref})</span>}
                            </li>
                          ))}
                        </ul>
                      )
                    ) : (
                      <span style={{ color: "#9ca3af" }}>— ยังไม่มีรายการ —</span>
                    )}
                  </td>
                  <td style={tdBase}><LineList lines={content.midLines} defaultColor={RED} /></td>
                  <td style={tdBase}><LineList lines={content.rightLines} /></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
