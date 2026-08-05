import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import Icon from "@/components/Icon";
import PrintButton from "./PrintButton";
import { drawingPublicUrl } from "@/lib/job-drawings/storage";
import type { AnnotColor, DrawingAnnotation, DrawingPage, JobDrawing } from "@/lib/job-drawings/types";

export const dynamic = "force-dynamic";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySb = { from: (t: string) => any };

const COLOR_HEX: Record<AnnotColor, string> = { "": "#000", red: "#c00000", blue: "#1a56db", green: "#15803d" };
// ฮาโลขาวรอบตัวอักษร (เหมือนหน้าแก้ไข) — อ่านออกแม้ทับเส้นแบบสีเข้ม
const HALO = "0 0 3px #fff, 0 0 3px #fff, 0 0 4px #fff, 0 0 5px #fff";

const PAGE_W_MM = 210;
const MARGIN_MM = 6;
const CONTENT_W_MM = PAGE_W_MM - MARGIN_MM * 2;

function PagePrint({ page, pageIndex, annotations, isLast }: { page: DrawingPage; pageIndex: number; annotations: DrawingAnnotation[]; isLast: boolean }) {
  const heightMm = page.w > 0 ? CONTENT_W_MM * (page.h / page.w) : CONTENT_W_MM * 1.414;
  const url = page.path.startsWith("http") ? page.path : drawingPublicUrl(page.path);
  return (
    <div
      style={{ width: `${PAGE_W_MM}mm`, padding: `${MARGIN_MM}mm`, position: "relative", background: "#fff", pageBreakAfter: isLast ? "auto" : "always", breakAfter: isLast ? "auto" : "page" }}
    >
      <div style={{ position: "relative", width: `${CONTENT_W_MM}mm`, height: `${heightMm}mm` }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- รูปจาก Supabase Storage public URL */}
        <img src={url} alt={`หน้า ${pageIndex + 1}`} style={{ width: `${CONTENT_W_MM}mm`, height: `${heightMm}mm`, display: "block" }} />
        {annotations.filter((a) => a.page === pageIndex).map((a) => (
          <div
            key={a.id}
            style={{
              position: "absolute",
              left: `${a.xf * CONTENT_W_MM}mm`,
              top: `${a.yf * heightMm}mm`,
              fontSize: `${Math.max(2, a.size * heightMm)}mm`,
              lineHeight: 1.25,
              color: COLOR_HEX[a.color ?? ""],
              textAlign: a.align ?? "left",
              textShadow: HALO,
              fontWeight: 600,
              whiteSpace: "pre-wrap",
              maxWidth: `${CONTENT_W_MM * 0.85}mm`,
            }}
          >
            {a.text}
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function DrawingPrintPage({
  params, searchParams,
}: { params: { jobId: string }; searchParams: { d?: string } }) {
  // ⚠ Server Component ไม่ผ่านชั้น BFF → ต้องเช็คสิทธิ์เอง (บทเรียน crew-teams/cover-sheet print)
  const profile = await getProfile();
  if (!profile || !can(profile.role, "drawings", "read")) redirect("/");

  const jobId = params.jobId;
  const sb = createClient() as unknown as AnySb;

  const [jobR, drawingR] = await Promise.all([
    sb.from("jobs").select("job_code, customer_name").eq("id", jobId).maybeSingle(),
    searchParams.d
      ? sb.from("job_drawings").select("*").eq("id", Number(searchParams.d)).eq("job_id", jobId).maybeSingle()
      : sb.from("job_drawings").select("*").eq("job_id", jobId).order("created_at", { ascending: true }).limit(1).maybeSingle(),
  ]);

  const job = jobR.data as { job_code: string | null; customer_name: string } | null;
  const drawing = drawingR.data as JobDrawing | null;

  return (
    <div className="min-h-dvh bg-gray-100 print:bg-white">
      <div className="no-print sticky top-0 z-10 bg-white border-b px-4 py-3 flex items-center justify-between">
        <Link href={`/cover-sheet/${jobId}/drawing`} className="press inline-flex items-center gap-1.5 text-sm text-ink-2">
          <Icon name="arrowLeft" size={16} /> กลับ
        </Link>
        <PrintButton />
      </div>

      {!job ? (
        <div className="no-print mx-auto mt-8 max-w-[210mm] text-center text-sm text-gray-500 px-4">ไม่พบงานนี้</div>
      ) : !drawing ? (
        <div className="no-print mx-auto mt-8 max-w-[210mm] text-center text-sm text-gray-500 px-4">งานนี้ยังไม่มีแบบที่อัปโหลด — กลับไปอัปโหลดก่อนพิมพ์</div>
      ) : (
        <div className="mx-auto my-6 shadow-lg print:shadow-none print:my-0" style={{ width: `${PAGE_W_MM}mm` }}>
          {drawing.pages.map((p, i) => (
            <PagePrint key={i} page={p} pageIndex={i} annotations={drawing.annotations ?? []} isLast={i === drawing.pages.length - 1} />
          ))}
        </div>
      )}
    </div>
  );
}
