import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import Icon from "@/components/Icon";
import PrintButton from "./PrintButton";
import { drawingPublicUrl } from "@/lib/job-drawings/storage";
import type { AnnotColor, DrawingAnnotation, DrawingPage, JobDrawing } from "@/lib/job-drawings/types";
import { HIGHLIGHT_HEX } from "@/lib/highlight-colors";

export const dynamic = "force-dynamic";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySb = { from: (t: string) => any };

const COLOR_HEX: Record<AnnotColor, string> = { "": "#000", red: "#c00000", blue: "#1a56db", green: "#15803d" };
// ฮาโลขาวรอบตัวอักษร (เหมือนหน้าแก้ไข) — อ่านออกแม้ทับเส้นแบบสีเข้ม (มีไฮไลต์พื้นทึบแล้วตัดออก กันเลอะ)
const HALO = "0 0 3px #fff, 0 0 3px #fff, 0 0 4px #fff, 0 0 5px #fff";

// เผื่อความสูง 3มม กัน "บล็อกเต็มหน้าเป๊ะ" แล้ว browser แถมหน้าเปล่า
const SAFETY_MM = 3;

function PagePrint({ page, pageIndex, annotations, isLast, pageWmm, pageHmm }: { page: DrawingPage; pageIndex: number; annotations: DrawingAnnotation[]; isLast: boolean; pageWmm: number; pageHmm: number }) {
  // พิมพ์แบบ "เต็มหน้าเหมือนต้นฉบับ" — ไม่ใส่ขอบขาว ไม่ย่อ · แค่ให้พอดีกรอบกระดาษ (กว้าง + สูงเผื่อกันหน้าเปล่า)
  const availW = pageWmm;
  const availH = pageHmm - SAFETY_MM;
  const aspect = page.w > 0 && page.h > 0 ? page.h / page.w : 1.414; // สูง/กว้าง
  let imgW = availW;
  let imgH = imgW * aspect;
  if (imgH > availH) { imgH = availH; imgW = imgH / aspect; }
  const url = page.path.startsWith("http") ? page.path : drawingPublicUrl(page.path);
  return (
    <div
      style={{
        width: `${imgW}mm`, height: `${imgH}mm`, margin: "0 auto", position: "relative", background: "#fff", overflow: "hidden",
        breakInside: "avoid", pageBreakInside: "avoid",
        pageBreakAfter: isLast ? "auto" : "always", breakAfter: isLast ? "auto" : "page",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- รูปจาก Supabase Storage public URL */}
      <img src={url} alt={`หน้า ${pageIndex + 1}`} style={{ width: `${imgW}mm`, height: `${imgH}mm`, display: "block" }} />
      {annotations.filter((a) => a.page === pageIndex).map((a) => (
        <div
          key={a.id}
          style={{
            position: "absolute",
            left: `${a.xf * imgW}mm`,
            top: `${a.yf * imgH}mm`,
            fontSize: `${Math.max(2, a.size * imgH)}mm`,
            lineHeight: 1.25,
            color: COLOR_HEX[a.color ?? ""],
            textAlign: a.align ?? "left",
            textShadow: a.hl ? "none" : HALO,
            background: a.hl ? HIGHLIGHT_HEX[a.hl] : undefined,
            borderRadius: a.hl ? "0.6mm" : undefined,
            padding: a.hl ? "0.3mm 0.8mm" : undefined,
            fontWeight: 600,
            whiteSpace: "pre-wrap",
            maxWidth: `${imgW * 0.9}mm`,
          }}
        >
          {a.text}
        </div>
      ))}
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

  // แนวกระดาษตามอัตราส่วนแบบ (แบบส่วนใหญ่ = A4 แนวนอน · ให้พอดีหน้าต่อหน้า ไม่แหก)
  const firstPage = drawing?.pages?.[0];
  const landscape = !!firstPage && firstPage.w >= firstPage.h;
  const pageWmm = landscape ? 297 : 210;   // ด้านกว้างของ A4 ตามแนว
  const pageHmm = landscape ? 210 : 297;   // ด้านสูงของ A4 ตามแนว

  return (
    <div className="min-h-dvh bg-gray-100 print:bg-white">
      {/* บังคับแนวกระดาษให้ตรงกับแบบ (ไม่งั้น browser default = แนวตั้ง แล้วแบบแนวนอนแหก) */}
      <style dangerouslySetInnerHTML={{ __html: `@page { size: A4 ${landscape ? "landscape" : "portrait"}; margin: 0; }` }} />
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
        <div className="mx-auto my-6 shadow-lg print:shadow-none print:my-0" style={{ width: `${pageWmm}mm` }}>
          {drawing.pages.map((p, i) => (
            <PagePrint key={i} page={p} pageIndex={i} annotations={drawing.annotations ?? []} isLast={i === drawing.pages.length - 1} pageWmm={pageWmm} pageHmm={pageHmm} />
          ))}
        </div>
      )}
    </div>
  );
}
