import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, err } from "@/lib/bff/response";
import { can } from "@/lib/rbac";
import { createServiceClient } from "@/lib/supabase/admin";
import { fetchAllPaged } from "@/lib/supabase/fetch-all";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/stats?from=YYYY-MM-DD&to=YYYY-MM-DD — สถิติ + KPI (รื้อใหม่ 9 พ.ย.69 หลังออดิต 3 ทีม)
 *
 * หลักการ (เจ้าของเคาะ 9 พ.ย.69):
 *   · ทุกคำว่า "ปิดได้ / ขาย / ยอดขาย" = งานที่ "ลูกค้ามัดจำในช่วงที่เลือก" (deposit_date) ฐานเดียวทั้งหน้า
 *   · "ประเมิน → ปิด" (cohort) ใช้เฉพาะการ์ดติดตามผล + %ปิด แยกกลุ่มชัดเจน
 *   · ยอดเงินของงาน "คิดสด" จากใบวางบิลที่ไม่ยกเลิก (Σ total − vat_amt) → ไม่มีบิลใช้ใบเสนอล่าสุด (approved ก่อน) → ไม่พึ่ง jobs.net_amount
 *     (jobs.net_amount เชื่อได้เฉพาะงานที่มีบิล · ฟอร์มใบเสนอปกติ/Rev ไม่อัปเดตมัน — นักบัญชี 9 พ.ย.69)
 *   · "ยอดเสนอ" = ใบเสนอล่าสุดของงาน (sent/approved) ตามวันส่งใบเสนอของงาน — ไม่ใช่ยอดบิล
 *   · อ่านด้วย service client หลังเช็คสิทธิ์ — RLS ของ queue_entries ให้ ADMIN/เจ้าของคิวเท่านั้น ถ้าใช้ client ของผู้ใช้ ตัวเลขจะต่างกันตาม role (QA 9 พ.ย.69)
 *   · query ไหนพัง → ส่ง warnings[] ขึ้นหน้า ไม่โชว์เลข 0 เงียบ ๆ
 *   · เงินถูกซ่อน (null) ถ้าไม่มีสิทธิ์ jobs:finance_fields
 */

type Sb = { from: (t: string) => any };
const num = (v: unknown) => Number(v ?? 0) || 0;
const d10 = (s?: string | null) => (s ? String(s).slice(0, 10) : "");

function dayDiff(a?: string | null, b?: string | null): number | null {
  if (!a || !b) return null;
  const ta = new Date(d10(a) + "T00:00:00").getTime();
  const tb = new Date(d10(b) + "T00:00:00").getTime();
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return null;
  return Math.round((tb - ta) / 86400000);
}
const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((s, n) => s + n, 0) / xs.length) * 10) / 10 : 0);
const median = (xs: number[]) => { if (!xs.length) return 0; const a = [...xs].sort((x, y) => x - y); const m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2); };
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

// วันที่ไทย (UTC+7) — Vercel เป็น UTC
const thaiToday = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
// timestamptz → วันที่ไทย (issues.created_at)
const thaiDateOf = (ts?: string | null) => { if (!ts) return ""; const t = new Date(ts).getTime(); return Number.isFinite(t) ? new Date(t + 7 * 3600_000).toISOString().slice(0, 10) : ""; };
const ISO = /^\d{4}-\d{2}-\d{2}$/;
function addDaysIso(iso: string, n: number): string { const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); }

// ── พื้นที่: กรุงเทพจัดกลุ่มเป็น "โซน/ทิศ" (ไม่โชว์เขตดิบ) · ต่างจังหวัดเอาแค่จังหวัด · ภูเก็ตเจาะอำเภอ ──
const BKK_ZONE: Record<string, string> = {
  พระนคร: "กลาง", ดุสิต: "กลาง", ป้อมปราบศัตรูพ่าย: "กลาง", สัมพันธวงศ์: "กลาง", ปทุมวัน: "กลาง",
  บางรัก: "กลาง", สาทร: "กลาง", บางคอแหลม: "กลาง", ยานนาวา: "กลาง", ราชเทวี: "กลาง",
  พญาไท: "กลาง", ดินแดง: "กลาง", ห้วยขวาง: "กลาง", วัฒนา: "กลาง", คลองเตย: "กลาง",
  จตุจักร: "เหนือ", บางซื่อ: "เหนือ", หลักสี่: "เหนือ", ดอนเมือง: "เหนือ", สายไหม: "เหนือ",
  บางเขน: "เหนือ", ลาดพร้าว: "เหนือ",
  บางกะปิ: "ตะวันออก", วังทองหลาง: "ตะวันออก", บึงกุ่ม: "ตะวันออก", คันนายาว: "ตะวันออก", สะพานสูง: "ตะวันออก",
  มีนบุรี: "ตะวันออก", คลองสามวา: "ตะวันออก", หนองจอก: "ตะวันออก", ลาดกระบัง: "ตะวันออก", ประเวศ: "ตะวันออก",
  สวนหลวง: "ตะวันออก", บางนา: "ตะวันออก", พระโขนง: "ตะวันออก",
  จอมทอง: "ใต้", ราษฎร์บูรณะ: "ใต้", ทุ่งครุ: "ใต้", บางขุนเทียน: "ใต้", บางบอน: "ใต้", หนองแขม: "ใต้",
  ธนบุรี: "ตะวันตก", คลองสาน: "ตะวันตก", บางกอกใหญ่: "ตะวันตก", บางกอกน้อย: "ตะวันตก", บางพลัด: "ตะวันตก",
  ตลิ่งชัน: "ตะวันตก", ทวีวัฒนา: "ตะวันตก", ภาษีเจริญ: "ตะวันตก", บางแค: "ตะวันตก",
};
const BKK_DISTRICTS = Object.keys(BKK_ZONE).sort((a, b) => b.length - a.length); // ชื่อยาวก่อน (บางกอกใหญ่ ก่อน บางกอก)
const BKK_DISTRICT_RE = new Map(BKK_DISTRICTS.map((d) => [d, new RegExp(`เขต\\s*${d}`)])); // สร้างครั้งเดียว
const PHUKET_AMPHOE = ["เมืองภูเก็ต", "กะทู้", "ถลาง", "เมือง"];
const PROVINCES = [
  "สมุทรปราการ", "นนทบุรี", "ปทุมธานี", "นครปฐม", "สมุทรสาคร", "สมุทรสงคราม", "ฉะเชิงเทรา", "ชลบุรี", "ระยอง", "จันทบุรี", "ตราด",
  "พระนครศรีอยุธยา", "อยุธยา", "อ่างทอง", "สระบุรี", "ลพบุรี", "สิงห์บุรี", "ชัยนาท", "นครนายก", "ปราจีนบุรี", "สระแก้ว", "ราชบุรี",
  "กาญจนบุรี", "สุพรรณบุรี", "เพชรบุรี", "ประจวบคีรีขันธ์", "นครราชสีมา", "โคราช", "ขอนแก่น", "อุดรธานี", "อุบลราชธานี", "บุรีรัมย์",
  "สุรินทร์", "ศรีสะเกษ", "ร้อยเอ็ด", "มหาสารคาม", "กาฬสินธุ์", "สกลนคร", "นครพนม", "มุกดาหาร", "หนองคาย", "เลย", "หนองบัวลำภู",
  "บึงกาฬ", "ชัยภูมิ", "ยโสธร", "อำนาจเจริญ", "เชียงใหม่", "เชียงราย", "ลำปาง", "ลำพูน", "แพร่", "น่าน", "พะเยา", "แม่ฮ่องสอน",
  "อุตรดิตถ์", "พิษณุโลก", "สุโขทัย", "ตาก", "กำแพงเพชร", "พิจิตร", "นครสวรรค์", "อุทัยธานี", "เพชรบูรณ์", "ชุมพร", "ระนอง",
  "สุราษฎร์ธานี", "นครศรีธรรมราช", "พังงา", "กระบี่", "ตรัง", "พัทลุง", "สงขลา", "สตูล", "ปัตตานี", "ยะลา", "นราธิวาส",
];
// address เต็ม → ป้ายพื้นที่ · "" = ไม่มีที่อยู่ · "?" = มีที่อยู่แต่แยกไม่ได้
//   ⚠ เช็คจังหวัดก่อนชื่อเขต — ไม่งั้น "ถ.บางนา-ตราด จ.สมุทรปราการ" กลายเป็น กทม.ตะวันออก (QA 9 พ.ย.69)
function areaLabel(raw?: string | null): string {
  const s = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  // 1) ภูเก็ต — เจาะอำเภอ
  if (s.includes("ภูเก็ต")) {
    for (const a of PHUKET_AMPHOE) { if (s.includes(a)) return "ภูเก็ต · " + (a === "เมือง" ? "เมืองภูเก็ต" : a); }
    return "ภูเก็ต";
  }
  // 2) จังหวัดระบุชัด ("จังหวัด X" / "จ.X") — ถ้าเป็นกรุงเทพให้ไปจัดโซน
  const pm = s.match(/จังหวัด\s*([ก-๙]+)/) || s.match(/(?:^|[^ก-๙])จ\.\s*([ก-๙]+)/);
  if (pm && !/กรุงเทพ|กทม/.test(pm[1])) {
    const hit = PROVINCES.find((p) => pm[1].startsWith(p));
    return hit === "โคราช" ? "นครราชสีมา" : hit === "อยุธยา" ? "พระนครศรีอยุธยา" : (hit ?? pm[1]);
  }
  // 3) ชื่อจังหวัดลอย ๆ (ไม่มีคำว่า จ.) ที่ไม่ใช่กรุงเทพ — ยกเว้นถ้ามีคำว่ากรุงเทพ/กทม อยู่ด้วย
  if (!/กรุงเทพ|กทม/.test(s)) {
    const prov = PROVINCES.find((p) => s.includes(p));
    if (prov) return prov === "โคราช" ? "นครราชสีมา" : prov === "อยุธยา" ? "พระนครศรีอยุธยา" : prov;
  }
  // 4) กรุงเทพ — จับชื่อเขต: "เขตX" ก่อน (ชัดสุด) → แล้วชื่อเขตลอย ๆ ที่ไม่ได้ตามหลัง ถนน/ซอย (กัน "ถ.ลาดพร้าว … บางกะปิ" ไปเข้าเขตลาดพร้าว)
  for (const d of BKK_DISTRICTS) { if (BKK_DISTRICT_RE.get(d)!.test(s)) return "กรุงเทพฯ · " + BKK_ZONE[d]; }
  for (const d of BKK_DISTRICTS) {
    let i = s.indexOf(d);
    while (i >= 0) {
      const before = s.slice(Math.max(0, i - 6), i);
      if (!/(ถนน|ถ\.|ซอย|ซ\.)\s*$/.test(before)) return "กรุงเทพฯ · " + BKK_ZONE[d];
      i = s.indexOf(d, i + d.length);
    }
  }
  if (/กรุงเทพ|กทม/.test(s)) return "กรุงเทพฯ · ไม่ระบุโซน";
  return "?";
}

// ─────────────────────────────────────────────────────────────────────────────

type JobRow = {
  id: string; job_code: string | null; status: string; assess_date: string | null; quote_sent_date: string | null; deposit_date: string | null;
  deposit_amount: number | null; design_state: string | null; design_start: string | null; design_end: string | null; design_due_date: string | null;
  customer_area: string | null; customer_id: number | string | null; customer_name: string | null; customer_tel: string | null; channel: string | null; external_intake: boolean | null;
  cancel_reason: string | null; estimator: { full_name: string | null } | null; designer_ref: number | null; designer_lookup: { name: string | null } | null;
  queue_entry_id: string | null;
  // 0044 / 0172 — ธงตามบัญชี
  onsite_deposit: boolean | null; customer_kind: "NEW" | "OLD" | "ADDON" | "SPECIAL" | null; ledger_note: string | null;
};
type Kind = "NEW" | "OLD" | "ADDON" | "SPECIAL";
type QuoteRow = { id: number; job_id: string | null; issue_date: string | null; status: string; subtotal: number | null; discount_amt: number | null; vat_amt: number | null; vat_rate: number | null; total: number | null; revision_no: number | null };
type BillRow = { id: number; job_id: string | null; quotation_id: number | null; issue_date: string | null; total: number | null; vat_amt: number | null; wht_amt: number | null; status: string };
type ItemRow = { name: string | null; qty: number | null; category: string | null; line_total: number | null; quotation_id: number };
type QueueRow = { id: string; job_id: string | null; customer_name: string | null; sales_id: string | null; address: string | null; contact_channel: string | null; job_type: string | null; queue_date: string | null; status: string; line_contact: string | null; assess_fee: number | null; old_customer: boolean | null; target_customer_id: number | null; target_job_id: string | null };

export const GET = withRoute(async (req: Request) => {
  // สิทธิ์ให้ตรงกับเมนู (Shell ซ่อน /stats ด้วย finance:read) — เดิมเปิด dashboard:read ทำให้ DESIGNER/VIEWER ยิง API ตรงได้ชื่อลูกค้า/วันมัดจำ (QA 9 พ.ย.69)
  const ctx = await requirePermission("finance", "read");
  const showFinance = can(ctx.role, "jobs:finance_fields", "read");
  const mask = (n: number): number | null => (showFinance ? Math.round(n) : null);
  const url = new URL(req.url);

  const today = thaiToday();
  const from = url.searchParams.get("from") || `${today.slice(0, 4)}-01-01`;
  const to = url.searchParams.get("to") || today;
  if (!ISO.test(from) || !ISO.test(to) || Number.isNaN(new Date(from + "T00:00:00").getTime()) || Number.isNaN(new Date(to + "T00:00:00").getTime()))
    return err("รูปแบบวันที่ไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)", 400);
  if (from > to) return err("วันเริ่มต้องไม่เกินวันสิ้นสุด", 400);
  // รอบเดือน: calendar (1–สิ้นเดือน) หรือ acct = รอบบัญชี 29 ของเดือนก่อน → 28 (บัญชีสรุปยอดรอบนี้เทียบเป้า) · มีผลกับการจัดกลุ่ม "รายเดือน" เท่านั้น ช่วง from/to มาจากหน้าเว็บ
  const period = url.searchParams.get("period") === "acct" ? "acct" : "calendar";
  // คีย์เดือนของวันที่: รอบบัญชี วันที่ ≥29 นับเป็นเดือนถัดไป
  const monthKeyOf = (iso: string): string => {
    const d = d10(iso); if (!d) return "";
    if (period === "calendar" || Number(d.slice(8, 10)) < 29) return d.slice(0, 7);
    let y = Number(d.slice(0, 4)), m = Number(d.slice(5, 7)) + 1; if (m > 12) { m = 1; y++; }
    return `${y}-${String(m).padStart(2, "0")}`;
  };
  // เทียบกับช่วงก่อนหน้าที่ยาวเท่ากัน (เดือนนี้ vs เดือนก่อน · ปีนี้ถึงวันนี้ vs ช่วงเดียวกันก่อนหน้า)
  const spanDays = Math.round((new Date(to + "T00:00:00").getTime() - new Date(from + "T00:00:00").getTime()) / 86400000) + 1;
  const prevTo = addDaysIso(from, -1), prevFrom = addDaysIso(from, -spanDays);
  const inR = (s: string | null | undefined, a = from, b = to) => { const d = d10(s); return !!d && d >= a && d <= b; };

  const warnings: string[] = [];
  const sb = createServiceClient() as unknown as Sb;
  const paged = <T,>(label: string, build: (f: number, t: number) => any) =>
    fetchAllPaged<T>(build, 1000, (e) => warnings.push(`${label}: ${(e as { message?: string })?.message ?? "โหลดไม่สำเร็จ"}`));

  const JOB_COLS_BASE = "id, job_code, status, assess_date, quote_sent_date, deposit_date, deposit_amount, design_state, design_start, design_end, design_due_date, customer_area, customer_id, customer_name, customer_tel, channel, external_intake, cancel_reason, estimator:estimator_id(full_name), designer_ref, designer_lookup:designer_ref(name), queue_entry_id, onsite_deposit";
  const fetchJobs = async (): Promise<JobRow[]> => {
    let colErr = "";
    const rows = await fetchAllPaged<JobRow>((f, t) => sb.from("jobs").select(JOB_COLS_BASE + ", customer_kind, ledger_note").order("id", { ascending: true }).range(f, t), 1000, (e) => { colErr = (e as { message?: string })?.message ?? "โหลดไม่สำเร็จ"; });
    if (!colErr) return rows;
    if (/customer_kind|ledger_note/.test(colErr)) {
      warnings.push("ยังไม่ได้รัน migration 0172 (ประเภทลูกค้าใหม่/เก่า + หมายเหตุบัญชี) → ใช้ค่าที่ระบบเดาแทน และยังแก้ในตารางไม่ได้");
      return paged<JobRow>("งาน", (f, t) => sb.from("jobs").select(JOB_COLS_BASE).order("id", { ascending: true }).range(f, t));
    }
    warnings.push(`งาน: ${colErr}`); return rows;
  };
  const [jobs, quotes, bills, queueRows, salesRes, custRows, issues, depFin, goalRes] = await Promise.all([
    fetchJobs(),
    paged<QuoteRow>("ใบเสนอราคา", (f, t) => sb.from("quotations")
      .select("id, job_id, issue_date, status, subtotal, discount_amt, vat_amt, vat_rate, total, revision_no")
      .order("id", { ascending: true }).range(f, t)),
    paged<BillRow>("ใบวางบิล", (f, t) => sb.from("billing_notes")
      .select("id, job_id, quotation_id, issue_date, total, vat_amt, wht_amt, status")
      .not("job_id", "is", null)
      .order("id", { ascending: true }).range(f, t)),
    paged<QueueRow>("คิวงาน", (f, t) => sb.from("queue_entries")
      .select("id, job_id, customer_name, sales_id, address, contact_channel, job_type, queue_date, status, line_contact, assess_fee, old_customer, target_customer_id, target_job_id")
      .order("id", { ascending: true }).range(f, t)),
    sb.from("queue_sales").select("id, name"),
    paged<{ id: number | string; address: string | null; contact_channel: string | null }>("ทะเบียนลูกค้า", (f, t) => sb.from("customers")
      .select("id, address, contact_channel")
      .order("id", { ascending: true }).range(f, t)),
    paged<{ severity: string; status: string; created_at: string }>("ปัญหา", (f, t) => sb.from("issues")
      .select("severity, status, created_at")
      .gte("created_at", `${addDaysIso(from, -1)}T17:00:00Z`).lt("created_at", `${to}T17:00:00Z`) // ช่วงวันไทย (UTC+7) แบบหยาบ แล้วกรองละเอียดอีกที
      .order("id", { ascending: true }).range(f, t)),
    // เงินมัดจำที่บันทึกจริง (ไม่ void) — ใช้เป็น "ยอดมัดจำ" เมื่อ jobs.deposit_amount ว่าง
    paged<{ job_id: string; amount: number | null }>("เงินมัดจำ", (f, t) => sb.from("finance_entries")
      .select("job_id, amount").eq("type", "DEPOSIT").eq("is_voided", false)
      .order("id", { ascending: true }).range(f, t)),
    sb.from("app_config").select("value").eq("key", "stats_goal_monthly").maybeSingle(),
  ]);
  const goalMonthly = Math.max(0, num(goalRes?.data?.value)) || 6_500_000; // เป้ายอดงานต่อเดือน (ก่อน VAT) · แก้ได้จากหน้าสถิติ
  const depFinByJob = new Map<string, number>();
  for (const f of depFin) depFinByJob.set(f.job_id, (depFinByJob.get(f.job_id) ?? 0) + num(f.amount));
  if (salesRes?.error) warnings.push(`รายชื่อเซลล์: ${salesRes.error.message ?? "โหลดไม่สำเร็จ"}`);
  if (jobs.length === 0 && warnings.some((w) => w.startsWith("งาน"))) return err("โหลดข้อมูลงานไม่สำเร็จ: " + warnings.join(" · "), 500);

  const J = jobs;
  const isCancelled = (j: JobRow) => j.status === "CANCELLED";
  // ยกเลิกอัตโนมัติ "ยังไม่ได้เข้าหน้างานจริง" (0067) = ไม่ได้ประเมินจริง → ไม่นับเป็นงานที่เข้าประเมิน
  const neverVisited = (j: JobRow) => isCancelled(j) && /^ยังไม่ได้เข้าหน้างานจริง/.test(String(j.cancel_reason ?? ""));

  // ── มูลค่างาน คิดสด: บิลที่ไม่ยกเลิก → ใบเสนอล่าสุด → 0 ──
  //   ⚠ billing_notes.total = ยอดที่เก็บจริง "หลังหักภาษี ณ ที่จ่าย" แล้ว (บริษัท) → ต้องบวก wht_amt กลับ ไม่งั้นยอดต่ำไปเท่า WHT (นักบัญชี 9 พ.ย.69)
  //      ก่อน VAT (หลังส่วนลด) = total − vat_amt + wht_amt · หลัง VAT = total + wht_amt
  const billByJob = new Map<string, { net: number; total: number; n: number; quoteIds: Set<number> }>();
  for (const b of bills) {
    if (!b.job_id || b.status === "cancelled") continue;
    const m = billByJob.get(b.job_id) ?? { net: 0, total: 0, n: 0, quoteIds: new Set<number>() };
    m.net += num(b.total) - num(b.vat_amt) + num(b.wht_amt); m.total += num(b.total) + num(b.wht_amt); m.n++;
    if (b.quotation_id != null) m.quoteIds.add(Number(b.quotation_id));
    billByJob.set(b.job_id, m);
  }
  // ใบเสนอล่าสุดของงาน: ใบที่ส่งแล้ว (sent/approved) ชนะใบร่าง · ในกลุ่มเดียวกันเอาวันออกใบล่าสุด (แล้ว id) — Rev แก้ในแถวเดิมอยู่แล้ว
  const rankQ = (q: QuoteRow) => (q.status === "approved" || q.status === "sent" ? 1 : 0);
  const latestQuoteByJob = new Map<string, QuoteRow>();   // ใบล่าสุดที่ไม่ยกเลิก (ใช้เป็นมูลค่างานเมื่อยังไม่มีบิล)
  const sentQuoteByJob = new Map<string, QuoteRow>();     // ใบล่าสุดที่ "ส่งแล้ว" (sent/approved) — ใช้เป็น "ยอดเสนอ"
  const activeQuoteCount = new Map<string, number>();     // งานที่มีใบส่งแล้วหลายใบพร้อมกัน (ไม่มีสถานะ "ถูกแทนที่") → เตือน
  const firstSentIssue = new Map<string, string>();      // วันออกใบเสนอใบแรกที่ส่งแล้ว — ใช้แทน jobs.quote_sent_date เมื่อว่าง (ฟอร์มใบเสนอปกติไม่ได้ตั้งค่านี้ → "ส่งใบเสนอ" หายเกือบหมดตั้งแต่ ส.ค.69)
  const pick = (a: QuoteRow | undefined, b: QuoteRow) =>
    !a || rankQ(b) > rankQ(a) || (rankQ(b) === rankQ(a) && (d10(b.issue_date) > d10(a.issue_date) || (d10(b.issue_date) === d10(a.issue_date) && b.id > a.id))) ? b : a;
  for (const q of quotes) {
    if (!q.job_id || q.status === "cancelled") continue;
    latestQuoteByJob.set(q.job_id, pick(latestQuoteByJob.get(q.job_id), q));
    if (q.status === "sent" || q.status === "approved") {
      sentQuoteByJob.set(q.job_id, pick(sentQuoteByJob.get(q.job_id), q)); activeQuoteCount.set(q.job_id, (activeQuoteCount.get(q.job_id) ?? 0) + 1);
      const d = d10(q.issue_date); const cur = firstSentIssue.get(q.job_id); if (d && (!cur || d < cur)) firstSentIssue.set(q.job_id, d);
    }
  }
  // วันส่งใบเสนอของงาน = jobs.quote_sent_date → ไม่มีก็วันออกใบเสนอใบแรกที่ส่งแล้ว
  const qsd = (j: JobRow): string | null => d10(j.quote_sent_date) || firstSentIssue.get(j.id) || null;
  const qNet = (q: QuoteRow) => num(q.total) - num(q.vat_amt);
  type Val = { net: number; total: number; src: "bill" | "quote" | "none" };
  const valueOf = (j: JobRow): Val => {
    const b = billByJob.get(j.id); if (b && b.n > 0) return { net: b.net, total: b.total, src: "bill" };
    const q = latestQuoteByJob.get(j.id); if (q) return { net: qNet(q), total: num(q.total), src: "quote" };
    return { net: 0, total: 0, src: "none" };
  };
  // ใบเสนอที่ใช้ฝั่ง "ขาย" ของหมวดสินค้า: ใบที่ผูกบิลจริงก่อน → ไม่มีก็ใบล่าสุด
  const soldQuoteIdsOf = (j: JobRow): number[] => {
    const b = billByJob.get(j.id); if (b && b.quoteIds.size) return [...b.quoteIds];
    const q = latestQuoteByJob.get(j.id); return q ? [q.id] : [];
  };
  const quotedValueOf = (j: JobRow): number => { const q = sentQuoteByJob.get(j.id) ?? latestQuoteByJob.get(j.id); return q ? qNet(q) : 0; };

  // ── เซลล์ / ที่อยู่ / ช่องทาง จากคิว — ผูกด้วย job_id / queue_entry_id · ชื่อลูกค้าใช้เฉพาะเมื่อชื่อนั้นมีคิวเดียว (กันจับผิดคน) ──
  const salesIdToName = new Map<string, string>(((salesRes?.data ?? []) as { id: string; name: string }[]).map((s) => [s.id, String(s.name).trim()]));
  const byJobQ = new Map<string, QueueRow>(), byQeQ = new Map<string, QueueRow>();
  const byNameQ = new Map<string, QueueRow | null>(); // null = ชื่อซ้ำหลายคิว → ไม่ใช้
  // งานมีหลายคิว → เอาคิวที่ไปจริง (DONE) และวันล่าสุดก่อน (เดิมเอาแถวแรกตาม id = สุ่ม)
  const betterQ = (a: QueueRow | undefined, b: QueueRow) => !a || (b.status === "DONE" ? 1 : 0) > (a.status === "DONE" ? 1 : 0) || ((b.status === "DONE") === (a.status === "DONE") && d10(b.queue_date) > d10(a.queue_date)) ? b : a;
  for (const q of queueRows) {
    if (q.status === "CANCELLED") continue;
    if (q.job_id) byJobQ.set(q.job_id, betterQ(byJobQ.get(q.job_id), q));
    byQeQ.set(q.id, q);
    const nm = String(q.customer_name ?? "").trim();
    if (nm.length >= 3) byNameQ.set(nm, byNameQ.has(nm) ? null : q);
  }
  const queueOf = (j: JobRow): QueueRow | undefined =>
    byJobQ.get(j.id) ?? (j.queue_entry_id ? byQeQ.get(j.queue_entry_id) : undefined) ?? (j.customer_name ? byNameQ.get(String(j.customer_name).trim()) ?? undefined : undefined);
  const custById = new Map<string, { address: string; channel: string | null }>();
  const normCh = (v: unknown): string | null => {
    const s = String(v ?? "").trim().toUpperCase();
    if (s === "FB" || s === "FACEBOOK") return "FACEBOOK";
    if (s === "IG" || s === "INSTAGRAM") return "INSTAGRAM";
    if (s === "LINE") return "LINE";
    if (s === "OTHER") return "OTHER";
    return null;
  };
  for (const c of custRows) custById.set(String(c.id), { address: String(c.address ?? "").trim(), channel: normCh(c.contact_channel) });
  const salesOf = (j: JobRow): string => {
    const q = queueOf(j); const nm = q?.sales_id ? salesIdToName.get(q.sales_id) : undefined;
    return nm || String(j.estimator?.full_name ?? "").trim() || "ไม่ระบุ";
  };
  const addressOf = (j: JobRow): string =>
    String(j.customer_area ?? "").trim() || String(queueOf(j)?.address ?? "").trim() || (j.customer_id != null ? custById.get(String(j.customer_id))?.address ?? "" : "");
  const channelOf = (j: JobRow): string =>
    normCh(queueOf(j)?.contact_channel) ?? (j.customer_id != null ? custById.get(String(j.customer_id))?.channel ?? null : null) ?? normCh(j.channel) ?? "OTHER";

  // ── ข้อมูลแบบสมุดบัญชี ต่องาน ──
  //   ประเภทลูกค้า: ระบบตัดสินเอง (เจ้าของ 9 พ.ย.69 "เอไอตรวจแม่นกว่าคน") · ค่าที่คนตั้งเอง (customer_kind) ยังชนะถ้ามี
  //   กฎ: 1) ชื่อขึ้นต้น "ช่าง" หรือเซลล์เป็นพาร์ตเนอร์ (คุกกี้/จรูญ/นัท) → SPECIAL
  //        2) คิวบอกลูกค้าเก่า (old_customer / ผูกลูกค้า-งานเดิม) → OLD
  //        3) "เคยเป็นลูกค้ามาก่อน" = มีงานอื่นของคนเดียวกัน (customer_id · เบอร์โทร · ชื่อ) ที่มัดจำ/ประเมินก่อนงานนี้ →
  //              ไม่มีคิวประเมิน (ช่างวัดจริง) = ADDON (งานเพิ่ม) · มีคิว = OLD
  //        4) ที่เหลือ NEW
  const normName = (n: unknown) => String(n ?? "").replace(/\(.*?\)|—.*$/g, "").replace(/คุ+ณ|^K\.|^k\./g, "").replace(/[\s\u200b\u00a0]+/g, "").toLowerCase();
  const normTel = (t: unknown) => { const d = String(t ?? "").replace(/\D/g, ""); return d.length >= 9 ? d.slice(-9) : ""; };
  const GENERIC_NAME = new Set(["ลูกค้า", "ทดสอบ", "test", ""]);
  // ดัชนี: key → รายการ (วันอ้างอิง = วันมัดจำ ถ้าไม่มีใช้วันประเมิน) ของงานที่ไม่ยกเลิก
  const custIdx = new Map<string, { id: string; date: string }[]>();
  const addIdx = (k: string, j: JobRow) => { if (!k) return; const a = custIdx.get(k) ?? []; a.push({ id: j.id, date: d10(j.deposit_date) || d10(j.assess_date) }); custIdx.set(k, a); };
  for (const j of J) {
    if (isCancelled(j) || j.external_intake) continue;
    if (j.customer_id != null) addIdx("c:" + j.customer_id, j);
    const t = normTel(j.customer_tel); if (t) addIdx("t:" + t, j);
    const n = normName(j.customer_name); if (n.length >= 3 && !GENERIC_NAME.has(n)) addIdx("n:" + n, j);
  }
  const hadPriorJob = (j: JobRow): boolean => {
    const ref = d10(j.deposit_date) || d10(j.assess_date); if (!ref) return false;
    const keys = [j.customer_id != null ? "c:" + j.customer_id : "", "t:" + normTel(j.customer_tel), (() => { const n = normName(j.customer_name); return n.length >= 3 && !GENERIC_NAME.has(n) ? "n:" + n : ""; })()];
    return keys.some((k) => k.length > 2 && (custIdx.get(k) ?? []).some((x) => x.id !== j.id && x.date && x.date < ref));
  };
  const PARTNER_RE = /คุกกี้|จรูญ|นัท/;
  const kindGuess = (j: JobRow): Kind => {
    if (/^ช่าง/.test(String(j.customer_name ?? "").trim()) || PARTNER_RE.test(salesOf(j))) return "SPECIAL";
    const q = queueOf(j);
    if (q && (q.old_customer || q.target_customer_id != null || q.target_job_id != null)) return "OLD";
    const prior = hadPriorJob(j);
    if (!q) return prior ? "ADDON" : "NEW";
    return prior ? "OLD" : "NEW";
  };
  const kindOf = (j: JobRow): Kind => j.customer_kind ?? kindGuess(j);
  const kindAuto = (j: JobRow) => !j.customer_kind; // true = ระบบตัดสินเอง (ไม่ต้องยืนยัน · โชว์เป็นข้อมูลเฉย ๆ)
  // มัดจำหน้างาน: ธง 0044 หรือ วันมัดจำ = วันประเมิน (บัญชีจดแบบนี้)
  const onsiteOf = (j: JobRow) => !!j.onsite_deposit || (!!j.deposit_date && !!j.assess_date && d10(j.deposit_date) === d10(j.assess_date) && !!queueOf(j));
  // VAT: บิลมี vat หรือใบเสนอล่าสุด vat_rate > 0
  const vatOf = (j: JobRow) => { const b = billByJob.get(j.id); if (b && b.n > 0) return bills.some((x) => x.job_id === j.id && x.status !== "cancelled" && num(x.vat_amt) > 0); const q = latestQuoteByJob.get(j.id); return !!q && (num(q.vat_rate) > 0 || num(q.vat_amt) > 0); };
  // ยอดมัดจำ: jobs.deposit_amount → Σ finance DEPOSIT → 0
  // ยอดมัดจำ "รับจริง" (รวม VAT ถ้างานมี VAT — งวดบิลเป็นยอดรวม VAT) vs "ก่อน VAT" (แบบที่บัญชีจดในสมุด: มัดจำ = % ของยอดงานก่อน VAT)
  const depositGrossOf = (j: JobRow) => num(j.deposit_amount) || depFinByJob.get(j.id) || 0;
  const vatRateOf = (j: JobRow) => { const q = latestQuoteByJob.get(j.id); const r = num(q?.vat_rate); return r > 0 ? r : 7; };
  const depositOf = (j: JobRow) => { const g = depositGrossOf(j); return vatOf(j) ? Math.round((g / (1 + vatRateOf(j) / 100)) * 100) / 100 : g; };
  const feeOf = (j: JobRow) => num(queueOf(j)?.assess_fee);
  const lineOf = (j: JobRow) => String(queueOf(j)?.line_contact ?? "").trim();

  // ── ฐานข้อมูล 3 กลุ่ม (ตัด external_intake = ลัดคิววัดลูกค้านอกระบบ ไม่ใช่งานขายในระบบ) ──
  const real = J.filter((j) => !j.external_intake);
  const cohortIn = (a: string, b: string) => real.filter((j) => inR(j.assess_date, a, b) && !neverVisited(j));          // เข้าประเมินในช่วง
  const depositedIn = (a: string, b: string) => real.filter((j) => inR(j.deposit_date, a, b) && !isCancelled(j));       // มัดจำในช่วง (ยังไม่ยกเลิก)
  const quotedIn = (a: string, b: string) => real.filter((j) => inR(qsd(j), a, b));                          // ส่งใบเสนอในช่วง (นับแม้ภายหลังยกเลิก — เสนอไปแล้วจริง)
  const cancelledAfterDepositIn = (a: string, b: string) => real.filter((j) => inR(j.deposit_date, a, b) && isCancelled(j));
  const won = (j: JobRow) => !!j.deposit_date && !isCancelled(j);

  const periodSummary = (a: string, b: string) => {
    const dep = depositedIn(a, b), qt = quotedIn(a, b), co = cohortIn(a, b);
    const vals = dep.map(valueOf);
    return {
      assessed: co.length,
      quoted: qt.length, quoted_amount: qt.reduce((s, j) => s + quotedValueOf(j), 0),
      deposited: dep.length,
      revenue: vals.reduce((s, v) => s + v.net, 0), revenue_vat: vals.reduce((s, v) => s + v.total, 0),
      from_quote: vals.filter((v) => v.src === "quote").length, zero: vals.filter((v) => v.src === "none").length,
      multi_quote: dep.filter((j) => (activeQuoteCount.get(j.id) ?? 0) > 1 && !(billByJob.get(j.id)?.n)).length,
      cancelled_after_deposit: cancelledAfterDepositIn(a, b).length,
      cancelled_after_deposit_amount: cancelledAfterDepositIn(a, b).reduce((s, j) => s + num(j.deposit_amount), 0),
      // แบบสมุดบัญชี
      deposit_sum: dep.reduce((s, j) => s + depositOf(j), 0),
      deposit_gross_sum: dep.reduce((s, j) => s + depositGrossOf(j), 0),
      fee_sum: dep.reduce((s, j) => s + feeOf(j), 0),
      kinds: dep.reduce((acc, j) => { acc[kindOf(j)]++; return acc; }, { NEW: 0, OLD: 0, ADDON: 0, SPECIAL: 0 } as Record<Kind, number>),
      kinds_amount: dep.reduce((acc, j) => { acc[kindOf(j)] += valueOf(j).net; return acc; }, { NEW: 0, OLD: 0, ADDON: 0, SPECIAL: 0 } as Record<Kind, number>),
      onsite: dep.filter(onsiteOf).length,
      vat: dep.filter(vatOf).length,
      kind_auto: dep.filter(kindAuto).length,
    };
  };
  const cur = periodSummary(from, to), prev = periodSummary(prevFrom, prevTo);

  // ── cohort ติดตามผล: งานที่เข้าประเมินในช่วงนี้ ตอนนี้ไปถึงไหน ──
  const cohort = cohortIn(from, to);
  const coQuoted = cohort.filter((j) => !!qsd(j));
  const coWon = cohort.filter(won);
  const coLost = cohort.filter((j) => isCancelled(j));
  const coPending = cohort.filter((j) => !won(j) && !isCancelled(j));
  // รอบเวลาปกติ ประเมิน→มัดจำ (งานที่ปิดได้ทั้งหมดในระบบ) — ไว้เตือนว่า cohort เดือนล่าสุดยังไม่สุก
  const lagAll = real.filter(won).map((j) => dayDiff(j.assess_date, j.deposit_date)).filter((d): d is number => d != null && d >= 0);
  const lagMedian = median(lagAll);
  const daysSinceFrom = Math.round((new Date(today + "T00:00:00").getTime() - new Date(to + "T00:00:00").getTime()) / 86400000);
  const immature = daysSinceFrom < lagMedian;

  // ── ใบเสนอ (เอกสาร) ที่ออกในช่วง: เฉพาะ sent/approved · สัดส่วนนอกระบบ (ทุกรายการ category ว่าง) ──
  const docQuotes = quotes.filter((q) => (q.status === "sent" || q.status === "approved") && inR(q.issue_date));

  // ── รายการสินค้า: ดึงเฉพาะใบที่ต้องใช้ (ใบเสนอของงานที่ส่งใบในช่วง + ใบของงานที่มัดจำในช่วง + ใบเอกสารในช่วง) ──
  const depositedJobs = depositedIn(from, to), quotedJobs = quotedIn(from, to);
  const soldQuoteIds = new Set<number>(), quotedQuoteIds = new Set<number>();
  depositedJobs.forEach((j) => soldQuoteIdsOf(j).forEach((id) => soldQuoteIds.add(id)));
  quotedJobs.forEach((j) => { const q = sentQuoteByJob.get(j.id) ?? latestQuoteByJob.get(j.id); if (q) quotedQuoteIds.add(q.id); });
  const needIds = [...new Set<number>([...soldQuoteIds, ...quotedQuoteIds, ...docQuotes.map((q) => q.id)])];
  const items: ItemRow[] = [];
  for (let i = 0; i < needIds.length; i += 300) {
    const chunk = needIds.slice(i, i + 300);
    items.push(...await paged<ItemRow>("รายการสินค้า", (f, t) => sb.from("quotation_items")
      .select("name, qty, category, line_total, quotation_id").in("quotation_id", chunk).order("id", { ascending: true }).range(f, t)));
  }
  const itemsByQuote = new Map<number, ItemRow[]>();
  for (const it of items) { const arr = itemsByQuote.get(it.quotation_id) ?? []; arr.push(it); itemsByQuote.set(it.quotation_id, arr); }
  const quoteById = new Map<number, QuoteRow>(quotes.map((q) => [q.id, q]));
  // ปันส่วนลดระดับใบลงรายการตามสัดส่วน (line_total เป็นยอดก่อนส่วนลด)
  const discountFactor = (q: QuoteRow | undefined) => { const sub = num(q?.subtotal); return q && sub > 0 ? Math.max(0, (sub - num(q.discount_amt)) / sub) : 1; };

  const hasItems = (q: QuoteRow) => (itemsByQuote.get(q.id)?.length ?? 0) > 0;
  const isExternal = (q: QuoteRow) => (itemsByQuote.get(q.id) ?? []).every((it) => !String(it.category ?? "").trim());
  const docQuotesWithItems = docQuotes.filter(hasItems);
  const extQuotes = docQuotesWithItems.filter(isExternal);

  // ── summary ──
  const summary = {
    // ที่เกิดขึ้นจริงในช่วง
    assessed: cur.assessed, quoted: cur.quoted, quoted_amount: mask(cur.quoted_amount),
    deposited: cur.deposited, revenue: mask(cur.revenue), revenue_vat: mask(cur.revenue_vat),
    revenue_from_quote: cur.from_quote, revenue_zero: cur.zero, revenue_multi_quote: cur.multi_quote,
    // แบบสมุดบัญชี (ไฟล์ "ยอดมัดจำ" ของบัญชี)
    deposit_sum: mask(cur.deposit_sum), deposit_gross_sum: mask(cur.deposit_gross_sum), fee_sum: mask(cur.fee_sum),
    kinds: cur.kinds, kinds_amount: { NEW: mask(cur.kinds_amount.NEW), OLD: mask(cur.kinds_amount.OLD), ADDON: mask(cur.kinds_amount.ADDON), SPECIAL: mask(cur.kinds_amount.SPECIAL) },
    onsite: cur.onsite, vat_count: cur.vat, kind_auto: cur.kind_auto,
    onsite_by_sales: Object.entries(depositedIn(from, to).filter(onsiteOf).reduce((acc, j) => { const n = salesOf(j); acc[n] = (acc[n] ?? 0) + 1; return acc; }, {} as Record<string, number>)).map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n),
    goal_monthly: mask(goalMonthly), period,
    cancelled_after_deposit: cur.cancelled_after_deposit, cancelled_after_deposit_amount: mask(cur.cancelled_after_deposit_amount),
    // เฉลี่ยต่องาน ตัดงานที่ไม่มียอดออกจากตัวหาร (นักบัญชี)
    avg_ticket: mask(cur.deposited - cur.zero > 0 ? cur.revenue / (cur.deposited - cur.zero) : 0),
    // เทียบช่วงก่อนหน้า (ยาวเท่ากัน)
    prev: { from: prevFrom, to: prevTo, assessed: prev.assessed, quoted: prev.quoted, deposited: prev.deposited, revenue: mask(prev.revenue), quoted_amount: mask(prev.quoted_amount) },
    // cohort: งานที่เข้าประเมินในช่วงนี้ ตอนนี้ไปถึงไหน
    cohort: {
      assessed: cohort.length, quoted: coQuoted.length, won: coWon.length, lost: coLost.length, pending: coPending.length,
      quote_rate: pct(coQuoted.length, cohort.length),      // ประเมิน → ส่งใบ
      close_rate: pct(coWon.length, cohort.length),         // ประเมิน → มัดจำ
      close_rate_of_quoted: pct(coWon.length, coQuoted.length), // ส่งใบ → มัดจำ
      won_amount: mask(coWon.reduce((s, j) => s + valueOf(j).net, 0)),
      pending_amount: mask(coPending.reduce((s, j) => s + quotedValueOf(j), 0)),
      lag_median_days: lagMedian, immature,
    },
    // เอกสารใบเสนอ
    quotation_docs: docQuotesWithItems.length, ext_quotes: extQuotes.length,
    ext_pct: docQuotesWithItems.length ? Math.round((extQuotes.length / docQuotesWithItems.length) * 1000) / 10 : 0,
  };

  // ── รายชื่อ (กดดู) ──
  // แถวรายชื่อ: stage = สถานะแบบย่อสำหรับหน้าจอ · src = ยอดมาจากไหน (bill/quote/none) · note = เหตุผลยกเลิก ฯลฯ
  type Row = {
    id: string; job_code: string | null; customer_name: string; date: string | null; net: number | null; net_vat: number | null; sales: string; area: string; src: "bill" | "quote" | "none"; stage: string; days?: number | null; note?: string;
    // แบบสมุดบัญชี
    line: string; assess_date: string | null; deposit: number | null; deposit_gross: number | null; fee: number | null; vat: boolean; kind: Kind; kind_auto: boolean; kind_guess: Kind; onsite: boolean; ledger_note: string; cancelled: boolean;
  };
  const stageOf = (j: JobRow) => (won(j) ? "WON" : isCancelled(j) ? "LOST" : qsd(j) ? "QUOTED" : "ASSESSED");
  const rowOf = (j: JobRow, date: string | null, v: Val | null, extra?: Partial<Row>): Row => ({
    id: j.id, job_code: j.job_code ?? null, customer_name: j.customer_name ?? "", date: d10(date) || null,
    net: mask(v?.net ?? 0), net_vat: mask(v?.total ?? 0), sales: salesOf(j), area: areaLabel(addressOf(j)) || "-",
    src: v?.src ?? "none", stage: stageOf(j),
    line: lineOf(j), assess_date: d10(j.assess_date) || null, deposit: mask(depositOf(j)), deposit_gross: mask(depositGrossOf(j)), fee: mask(feeOf(j)), vat: vatOf(j),
    kind: kindOf(j), kind_auto: kindAuto(j), kind_guess: kindGuess(j), onsite: onsiteOf(j), ledger_note: String(j.ledger_note ?? "").trim(), cancelled: isCancelled(j),
    ...extra,
  });
  const byDateDesc = (a: Row, b: Row) => String(b.date ?? "").localeCompare(String(a.date ?? ""));
  const quotedVal = (j: JobRow): Val => ({ net: quotedValueOf(j), total: 0, src: sentQuoteByJob.has(j.id) || latestQuoteByJob.has(j.id) ? "quote" : "none" });
  const lists = {
    deposits: [
      ...depositedJobs.map((j) => rowOf(j, j.deposit_date, valueOf(j))),
      ...cancelledAfterDepositIn(from, to).map((j) => rowOf(j, j.deposit_date, valueOf(j), { note: String(j.cancel_reason ?? "").trim() || "-" })),
    ].sort(byDateDesc),
    quoted: quotedJobs.map((j) => rowOf(j, qsd(j), quotedVal(j))).sort(byDateDesc),
    assessed: cohort.map((j) => rowOf(j, j.assess_date, quotedVal(j))).sort(byDateDesc), // ยอดใบเสนอทุกแถว (หัวคอลัมน์ "ยอดใบเสนอ") ไม่ปนยอดบิล
    cohort_won: coWon.map((j) => rowOf(j, j.deposit_date, valueOf(j))).sort(byDateDesc),
    cohort_pending: coPending.map((j) => rowOf(j, qsd(j) ?? j.assess_date, quotedVal(j), { days: dayDiff(qsd(j) ?? j.assess_date, today) })).sort((a, b) => (b.days ?? 0) - (a.days ?? 0)),
    cohort_lost: coLost.map((j) => rowOf(j, j.assess_date, null, { note: String(j.cancel_reason ?? "").trim() || "-" })).sort(byDateDesc),
    cancelled_after_deposit: cancelledAfterDepositIn(from, to).map((j) => rowOf(j, j.deposit_date, { net: num(j.deposit_amount), total: 0, src: "none" }, { note: String(j.cancel_reason ?? "").trim() || "-" })).sort(byDateDesc),
  };

  // ── รายเดือน: ประเมิน n · ส่งใบ n/฿ · มัดจำ n/฿ · %มัดจำต่อส่งใบ (เดือนเดียวกัน) · %ปิด cohort ของเดือนนั้น ──
  const monthKeys: string[] = [];
  { let y = Number(monthKeyOf(from).slice(0, 4)), m = Number(monthKeyOf(from).slice(5, 7)); const end = monthKeyOf(to); while (monthKeys.length < 60) { const k = `${y}-${String(m).padStart(2, "0")}`; monthKeys.push(k); if (k >= end) break; m++; if (m > 12) { m = 1; y++; } } }
  const mk = (s?: string | null) => monthKeyOf(s ?? "");
  const bucket = <T,>(rows: JobRow[], key: (j: JobRow) => string, map: (j: JobRow) => T) => { const o = new Map<string, T[]>(); for (const j of rows) { const k = key(j); if (!k) continue; const a = o.get(k) ?? []; a.push(map(j)); o.set(k, a); } return o; };
  const depM = bucket(real.filter((j) => !isCancelled(j) && j.deposit_date), (j) => mk(j.deposit_date), (j) => ({ ...valueOf(j), dep: depositOf(j), fee: feeOf(j), kind: kindOf(j), onsite: onsiteOf(j) }));
  const qtM = bucket(real.filter((j) => qsd(j)), (j) => mk(qsd(j)), (j) => quotedValueOf(j));
  const asM = bucket(real.filter((j) => j.assess_date && !neverVisited(j)), (j) => mk(j.assess_date), (j) => won(j));
  const byMonth = monthKeys.map((m) => {
    const dep = depM.get(m) ?? [], qt = qtM.get(m) ?? [], as = asM.get(m) ?? [];
    return {
      month: m, partial: m === monthKeyOf(today),
      assessed: as.length, cohort_won: as.filter(Boolean).length, cohort_close_rate: pct(as.filter(Boolean).length, as.length),
      quoted: qt.length, quoted_amount: mask(qt.reduce((s, n) => s + n, 0)),
      deposited: dep.length, revenue: mask(dep.reduce((s, v) => s + v.net, 0)), revenue_vat: mask(dep.reduce((s, v) => s + v.total, 0)),
      deposit_per_quote: pct(dep.length, qt.length),
      deposit_sum: mask(dep.reduce((s, v) => s + v.dep, 0)), fee_sum: mask(dep.reduce((s, v) => s + v.fee, 0)),
      kinds: dep.reduce((acc, v) => { acc[v.kind]++; return acc; }, { NEW: 0, OLD: 0, ADDON: 0, SPECIAL: 0 } as Record<Kind, number>),
      onsite: dep.filter((v) => v.onsite).length,
      goal: mask(goalMonthly),
    };
  });

  // ── พื้นที่: เข้าประเมิน (cohort) · มัดจำในช่วง · ยอดขายในช่วง ──
  type Area = { area: string; assessed: number; deposited: number; revenue: number };
  const areaMap = new Map<string, Area>(); let areaUnknown = 0, areaOther = 0, areaUnknownDep = 0;
  const areaCache = new Map<string, string>();
  const areaOf = (j: JobRow) => { const addr = addressOf(j); let l = areaCache.get(addr); if (l == null) { l = areaLabel(addr); areaCache.set(addr, l); } return l; };
  const touchArea = (label: string) => { const a = areaMap.get(label) ?? { area: label, assessed: 0, deposited: 0, revenue: 0 }; areaMap.set(label, a); return a; };
  for (const j of cohort) { const l = areaOf(j); if (l === "") { areaUnknown++; continue; } if (l === "?") { areaOther++; continue; } touchArea(l).assessed++; }
  for (const j of depositedJobs) { const l = areaOf(j); if (!l || l === "?") { areaUnknownDep++; continue; } const a = touchArea(l); a.deposited++; a.revenue += valueOf(j).net; }
  const areasSorted = [...areaMap.values()].sort((a, b) => b.assessed - a.assessed || b.deposited - a.deposited || a.area.localeCompare(b.area, "th"));
  const areaTop = areasSorted.slice(0, 15), areaRest = areasSorted.slice(15);
  const byArea = areaTop.map((a) => ({ ...a, revenue: mask(a.revenue) }));
  if (areaRest.length) byArea.push({ area: `อื่น ๆ (${areaRest.length} พื้นที่)`, assessed: areaRest.reduce((s, a) => s + a.assessed, 0), deposited: areaRest.reduce((s, a) => s + a.deposited, 0), revenue: mask(areaRest.reduce((s, a) => s + a.revenue, 0)) });

  // ── ช่องทาง: เข้าประเมิน (cohort) + มัดจำในช่วง ──
  const CH_ALL = ["LINE", "FACEBOOK", "INSTAGRAM", "OTHER"];
  const chA: Record<string, number> = { LINE: 0, FACEBOOK: 0, INSTAGRAM: 0, OTHER: 0 }, chD: Record<string, number> = { LINE: 0, FACEBOOK: 0, INSTAGRAM: 0, OTHER: 0 };
  cohort.forEach((j) => { chA[channelOf(j)]++; }); depositedJobs.forEach((j) => { chD[channelOf(j)]++; });
  const byChannel = CH_ALL.map((channel) => ({ channel, assessed: chA[channel], deposited: chD[channel] }));

  // ── ประเภทงานนิยม: นับ "จำนวนงาน" ที่มีสินค้านั้นในใบเสนอล่าสุด (ไม่นับ qty — หน่วยต่างกัน · ไม่นับซ้ำข้าม Rev) ──
  const baseName = (n: string) => n.replace(/\s*[（(].*$/s, "").trim() || n.trim();
  const itemJobs = new Map<string, { quoted: Set<number>; sold: Set<number>; qty: number }>();
  const addItems = (qid: number, kind: "quoted" | "sold") => {
    for (const it of itemsByQuote.get(qid) ?? []) {
      if (!String(it.category ?? "").trim()) continue; // เฉพาะรายการที่คิดผ่านระบบ
      const name = baseName(String(it.name ?? "")); if (!name) continue;
      const m = itemJobs.get(name) ?? { quoted: new Set(), sold: new Set(), qty: 0 }; itemJobs.set(name, m);
      m[kind].add(qid); if (kind === "quoted") m.qty += num(it.qty);
    }
  };
  quotedQuoteIds.forEach((id) => addItems(id, "quoted")); soldQuoteIds.forEach((id) => addItems(id, "sold"));
  const topItems = [...itemJobs.entries()].map(([name, m]) => ({ name, quoted_jobs: m.quoted.size, sold_jobs: m.sold.size, qty: Math.round(m.qty) }))
    .sort((a, b) => b.quoted_jobs - a.quoted_jobs || b.sold_jobs - a.sold_jobs).slice(0, 12);

  // ── สินค้าตามหมวด: เสนอ = ใบล่าสุดของงานที่ส่งใบในช่วง · ขาย = ใบล่าสุดของงานที่มัดจำในช่วง (หักส่วนลดตามสัดส่วน · นับงานไม่นับใบ) ──
  type Cat = { category: string; q_jobs: Set<number>; s_jobs: Set<number>; q_qty: number; s_qty: number; q_rev: number; s_rev: number };
  const catMap = new Map<string, Cat>(); let uncategorized = 0;
  const addCat = (qid: number, kind: "q" | "s") => {
    const q = quoteById.get(qid); const f = discountFactor(q);
    for (const it of itemsByQuote.get(qid) ?? []) {
      const cat = String(it.category ?? "").trim(); if (!cat) { if (kind === "q") uncategorized++; continue; }
      const m = catMap.get(cat) ?? { category: cat, q_jobs: new Set(), s_jobs: new Set(), q_qty: 0, s_qty: 0, q_rev: 0, s_rev: 0 }; catMap.set(cat, m);
      const lt = num(it.line_total) * f, qty = num(it.qty);
      if (kind === "q") { m.q_jobs.add(qid); m.q_qty += qty; m.q_rev += lt; } else { m.s_jobs.add(qid); m.s_qty += qty; m.s_rev += lt; }
    }
  };
  quotedQuoteIds.forEach((id) => addCat(id, "q")); soldQuoteIds.forEach((id) => addCat(id, "s"));
  const byCategory = [...catMap.values()].map((m) => ({
    category: m.category,
    quoted_jobs: m.q_jobs.size, quoted_qty: Math.round(m.q_qty), quoted_revenue: mask(m.q_rev),
    sold_jobs: m.s_jobs.size, sold_qty: Math.round(m.s_qty), sold_revenue: mask(m.s_rev),
    avg_price: mask(m.s_qty ? m.s_rev / m.s_qty : 0),
    _s: m.s_rev,
  })).sort((a, b) => (showFinance ? b._s - a._s : 0) || b.sold_jobs - a.sold_jobs || b.quoted_jobs - a.quoted_jobs).map(({ _s, ...c }) => c);

  // ════════ KPI ════════
  // เซลล์รายคน — เข้าประเมิน(cohort) · เข้าหน้างานอื่น(คิว DONE ไม่ใช่ประเมิน) · ส่งใบ(cohort) · มัดจำจากประเมิน · มัดจำในช่วง · ยอดเสนอ(ช่วง) · ยอดขาย(ช่วง)
  const isAssessType = (jt: unknown) => { const s = String(jt ?? "").trim(); return !s || /ประเมิน/.test(s); };
  type SM = { name: string; assessed: number; other_visits: number; quoted_cohort: number; won_cohort: number; deposited: number; quoted_amount: number; sold_amount: number };
  const sm = new Map<string, SM>();
  const S = (nm: string) => { const m = sm.get(nm) ?? { name: nm, assessed: 0, other_visits: 0, quoted_cohort: 0, won_cohort: 0, deposited: 0, quoted_amount: 0, sold_amount: 0 }; sm.set(nm, m); return m; };
  for (const q of queueRows) {
    if (q.status !== "DONE" || !inR(q.queue_date) || isAssessType(q.job_type)) continue; // นับเฉพาะคิวที่ไปจริง (DONE) — เดิมนับ PENDING/PROPOSED ด้วย
    const nm = q.sales_id ? salesIdToName.get(q.sales_id) : undefined; if (nm) S(nm).other_visits++;
  }
  for (const j of cohort) { const m = S(salesOf(j)); m.assessed++; if (qsd(j)) m.quoted_cohort++; if (won(j)) m.won_cohort++; }
  for (const j of depositedJobs) { const m = S(salesOf(j)); m.deposited++; m.sold_amount += valueOf(j).net; }
  for (const j of quotedJobs) S(salesOf(j)).quoted_amount += quotedValueOf(j);
  const bySales = [...sm.values()].map((s) => ({
    name: s.name, assessed: s.assessed, other_visits: s.other_visits, quoted_cohort: s.quoted_cohort, won_cohort: s.won_cohort,
    close_rate: pct(s.won_cohort, s.assessed), deposited: s.deposited,
    quoted_amount: mask(s.quoted_amount), sold_amount: mask(s.sold_amount), _sold: s.sold_amount,
  })).sort((a, b) => (showFinance ? b._sold - a._sold : 0) || b.deposited - a.deposited || b.assessed - a.assessed).map(({ _sold, ...s }) => s);

  // เขียนแบบ
  const drawn = J.filter((j) => !isCancelled(j) && inR(j.design_end) && j.design_state === "DONE");
  const durs = drawn.map((j) => dayDiff(j.design_start, j.design_end)).filter((d): d is number => d != null && d >= 0);
  const isLate = (j: JobRow) => !!j.design_due_date && !!j.design_end && d10(j.design_end) > d10(j.design_due_date);
  const dMap = new Map<string, { name: string; ref: number | null; done: number; _dur: number[]; late: number }>();
  for (const j of drawn) {
    const key = j.designer_ref != null ? `r:${j.designer_ref}` : "none";
    const m = dMap.get(key) ?? { name: j.designer_lookup?.name ?? "ไม่ระบุผู้เขียน", ref: j.designer_ref ?? null, done: 0, _dur: [], late: 0 }; dMap.set(key, m);
    m.done++; const d = dayDiff(j.design_start, j.design_end); if (d != null && d >= 0) m._dur.push(d); if (isLate(j)) m.late++;
  }
  const drawing = { done: drawn.length, avg_days: avg(durs), late: drawn.filter(isLate).length, byDesigner: [...dMap.values()].map((m) => ({ name: m.name, ref: m.ref, done: m.done, avg_days: avg(m._dur), late: m.late })).sort((a, b) => b.done - a.done) };

  // ใบเสนอราคา: เวลา ประเมิน→ส่งใบ
  const turnarounds = quotedJobs.map((j) => dayDiff(j.assess_date, qsd(j))).filter((d): d is number => d != null && d >= 0); // ตัดที่ไม่มีวันประเมิน และที่ส่งใบ "ก่อน" วันประเมิน (วันที่ผิด)
  const buckets = { d0: 0, d1_2: 0, d3_5: 0, d6: 0 };
  turnarounds.forEach((d) => { if (d === 0) buckets.d0++; else if (d <= 2) buckets.d1_2++; else if (d <= 5) buckets.d3_5++; else buckets.d6++; });
  // รอบขาย ส่งใบ→มัดจำ ของงานที่มัดจำในช่วง
  const cycles = depositedJobs.map((j) => dayDiff(qsd(j), j.deposit_date)).filter((d): d is number => d != null && d >= 0);
  const quotation = { done: quotedJobs.length, avg_days: avg(turnarounds), median_days: median(turnarounds), no_time: quotedJobs.length - turnarounds.length, buckets, cycle_avg_days: avg(cycles), cycle_median_days: median(cycles) };

  // ปัญหา (วันไทย)
  const inIssues = issues.filter((i) => inR(thaiDateOf(i.created_at)));
  const sev: Record<string, number> = { LOW: 0, MEDIUM: 0, HIGH: 0 };
  inIssues.forEach((i) => { if (i.severity in sev) sev[i.severity]++; });

  return ok({
    range: { from, to, today, span_days: spanDays },
    can_finance: showFinance,
    warnings,
    summary, lists, byMonth, byArea, areaUnknown, areaOther, areaUnknownDep, byChannel, topItems,
    byCategory, uncategorizedItems: uncategorized,
    bySales, drawing, quotation,
    issues: { total: inIssues.length, open: inIssues.filter((i) => i.status !== "CLOSED").length, bySeverity: sev },
  });
});
