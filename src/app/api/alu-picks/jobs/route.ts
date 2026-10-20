import { withRoute } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";
import { requireChangOr } from "@/lib/bff/chang-ctx";
import { buildScheduleRows } from "@/lib/production/schedule";

export const dynamic = "force-dynamic";

/**
 * GET /api/alu-picks/jobs → งานที่อยู่ในตารางผลิต (ชุดเดียวกับที่ช่างเห็นบนลิงก์ช่าง — ใช้ buildScheduleRows ตัวเดียวกัน)
 *   ช่างกดชื่อลูกค้าจากตรงนี้ตอนเบิก · เรียงตามวันกำหนดเสร็จ
 *   เจ้าของ 20 ต.ค.69: "รหัสงานไม่ได้ช่วยอะไร ช่างไม่รู้รหัส" → ส่งสิ่งที่ช่างรู้จักแทน:
 *     ทำอะไร (ชื่อชุดงาน) · อยู่ที่ไหน (หมู่บ้าน/เขต) · โรงไหน · เซลล์ใคร · เสร็จเมื่อไหร่
 */
type SetRow = { set_label?: unknown; factories?: unknown };

/** "ชุด1. กั้นห้องโถง (โถงทางเข้า ชั้น 4) (รุ่น SlimLux) (1.52 × 2.17 ม.)" → "กั้นห้องโถง (โถงทางเข้า ชั้น 4)" */
function shortSet(label: string): string {
  return label
    .replace(/^\s*ชุด\s*\d+\s*[.:)-]?\s*/, "")
    .replace(/\((?:ขนาด\s*)?[\d.]+\s*[x×]\s*[\d.]+\s*ม\.?\)/gi, "")
    .replace(/\(\s*รุ่น[^)]*\)/g, "")
    .replace(/\(\s*ชุด[^)]*\)/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
/** ที่อยู่ยาว → "หมู่บ้านนันทวัน · บางเขน" (สิ่งที่ช่างจำได้) */
function shortPlace(addr: string): string {
  const a = String(addr ?? "").replace(/\s+/g, " ").trim();
  if (!a) return "";
  // ชื่อโครงการ/ร้านที่ขึ้นต้นที่อยู่ (Jade Sathorn-Rama3 · ร้านบุญสว่างวานิช) ก่อนคำว่า เลขที่/ถนน/ซอย/เลขบ้าน
  const lead = a.split(/\s(?=เลขที่|ถนน|ถ\.|ซอย|ซ\.|แขวง|ตำบล|\d+\/)/)[0].trim();
  const leadName = lead && lead !== a && !/^(เลขที่|\d)/.test(lead) && lead.length <= 32 ? lead : "";
  // ชื่อหมู่บ้านมีเว้นวรรคได้ ("หมู่บ้านเดอะ แกรนด์ พระราม 2") → เอาจนกว่าจะเจอ เลขที่/ซอย/ถนน/ตำบล/เขต/วงเล็บ
  const vm = a.match(/(?:หมู่บ้าน|ม\.)\s*(.+?)(?=\s*(?:\(|,|เลขที่|ซ\.|ซอย|ถ\.|ถนน|ตำบล|ต\.|แขวง|อำเภอ|อ\.|เขต|หมู่\s|\d+\/|$))/);
  const fullV = vm ? `หมู่บ้าน${vm[1].trim()}` : "";
  // ยาวเกิน → ตัดที่เว้นวรรค (ไม่ตัดกลางคำ เช่น "พหลโยธ")
  const village = fullV ? (fullV.length <= 32 ? fullV : fullV.slice(0, fullV.lastIndexOf(" ", 32) > 8 ? fullV.lastIndexOf(" ", 32) : 32)) : leadName;
  const district = a.match(/(?:เขต|อำเภอ|อ\.)\s*([^\s,]+)/)?.[1] ?? "";
  const parts = [village, district].filter(Boolean);
  if (parts.length) return parts.join(" · ");
  // ไม่มีหมู่บ้าน/เขต → เอาคำแรก ๆ ของที่อยู่ (ชื่อร้าน/โครงการ)
  return a.slice(0, 28);
}

export const GET = withRoute(async (req: Request) => {
  // สิทธิ์ "stock" (ไม่ใช่ production) — role สโตร์ไม่มี production แต่ต้องเห็นรายชื่องานตอนเบิกแทนช่าง
  const ctx = await requireChangOr(req, "stock", "read");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = await buildScheduleRows(ctx.supabase as unknown as { from: (t: string) => any });
  const jobs = rows
    .filter((r) => r.kind === "job" && r.job_id)
    .map((r) => {
      const sets = (r.sets ?? []) as SetRow[];
      const what = [...new Set(sets.map((s) => shortSet(String(s.set_label ?? ""))).filter(Boolean))];
      const factories = [...new Set(sets.flatMap((s) => (Array.isArray(s.factories) ? s.factories : []) as string[]).filter(Boolean))];
      return {
        job_id: r.job_id as string, title: r.title, job_code: r.job_code, subtitle: r.subtitle,
        due_date: r.due_date, install_date: r.install_date, status: r.status,
        what, set_count: sets.length, factories, sales_name: r.sales_name ?? null,
        place: shortPlace(r.customer_area ?? r.subtitle ?? ""),
      };
    })
    // กำลังทำอยู่ขึ้นก่อน (ผลิตเสร็จแล้ว READY ไว้ท้าย) แล้วเรียงวันกำหนดเสร็จ
    .sort((a, b) => (Number(a.status === "READY") - Number(b.status === "READY")) || String(a.due_date ?? "9999").localeCompare(String(b.due_date ?? "9999")));
  return ok(jobs);
});
