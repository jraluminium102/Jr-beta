import { redirect } from "next/navigation";
import { getProfile, canWrite } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import QuotationForm, { type QuotationCopySource } from "@/components/QuotationForm";
import type { Customer } from "@/lib/types";
import { CHECKLIST_MARKER } from "@/lib/checklist-marker";

export const dynamic = "force-dynamic";

// "สร้างซ้ำ" (เจ้าของ 26 พ.ย.69) — /quotations/new?copy=<id> เปิดฟอร์มพร้อมข้อมูลของใบต้นทาง
//   เป็นใบใหม่ล้วน: ได้เลขใหม่ตอนบันทึก · วันที่ = วันนี้ · ไม่ก๊อปสถานะ/Rev/บิล/งานที่ผูก · ใบต้นทางไม่ถูกแตะ
//   เปลี่ยนลูกค้า/หัวบิลได้ในฟอร์มก่อนบันทึก
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadCopySource(supabase: any, rawId: string | undefined): Promise<QuotationCopySource | null> {
  const id = Number(rawId);
  if (!rawId || !Number.isInteger(id) || id <= 0) return null;
  const { data } = await supabase.from("quotations").select("*, quotation_items(*)").eq("id", id).maybeSingle();
  if (!data) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = data as any;
  const s = (q.customer_snapshot ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => String(v ?? "").trim();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items = ((q.quotation_items ?? []) as any[])
    .slice()
    .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0))
    .map((it) => ({
      name: String(it.name ?? ""),
      detail: String(it.detail ?? ""),
      qty: Number(it.qty) || 0,
      unit_price: Number(it.unit_price) || 0,
      category: String(it.category ?? ""),
      product_id: String(it.product_id ?? ""),
      group_label: String(it.group_label ?? ""),
      calc_recipe: it.calc_recipe ?? null,
    }));
  // ส่วนลด: ใบใหม่เก็บเป็นหลายรายการ (0105) · ใบเก่ามีแค่ยอดรวม → แปลงเป็น 1 รายการ (บาทเป็นตัวตั้ง)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lines = Array.isArray(q.discounts) ? (q.discounts as any[]) : [];
  const discounts = lines.length
    ? lines.map((d) => ({ label: String(d?.label ?? ""), pct: Number(d?.pct) || 0, amt: Number(d?.amt) || 0 }))
    : Number(q.discount_amt) > 0
      ? [{ label: String(q.discount_label ?? ""), pct: Number(q.discount_pct) || 0, amt: Number(q.discount_amt) || 0 }]
      : [];
  const note = String(q.note ?? "");
  return {
    id: q.id,
    code: String(q.code ?? ""),
    customer_id: q.customer_id ?? null,
    customer_name: str(s.name),
    header: {
      kind: s.kind === "COMPANY" ? "COMPANY" : "INDIVIDUAL",
      name: str(s.name),
      tax_id: str(s.tax_id),
      branch: str(s.branch) || "สำนักงานใหญ่",
      postal_code: str(s.postal_code),
      address: str(s.address),
      contact_person: str(s.contact_person),
      phone: str(s.phone),
    },
    items,
    vat_rate: Number(q.vat_rate) || 0,
    wht_rate: Number(q.wht_rate) || 0,
    discounts,
    // ป้ายภายในของใบเบาเช็คลิสต์ ไม่ใช่ข้อความถึงลูกค้า — ไม่ก๊อปตาม
    note: note.startsWith(CHECKLIST_MARKER) ? note.slice(CHECKLIST_MARKER.length).trim() : note,
    conditions_work: Array.isArray(q.conditions_work) ? (q.conditions_work as unknown[]).map(String) : null,
    conditions_quote: Array.isArray(q.conditions_quote) ? (q.conditions_quote as unknown[]).map(String) : null,
  };
}

export default async function NewQuotationPage({ searchParams }: { searchParams?: { copy?: string } }) {
  const profile = await getProfile();
  if (!canWrite(profile?.role)) redirect("/quotations");

  const supabase = createClient();
  const [{ data }, copyFrom] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name, job, address")
      .eq("is_active", true)
      .order("name"),
    loadCopySource(supabase, searchParams?.copy),
  ]);
  // ขอสร้างซ้ำแต่หาใบต้นทางไม่เจอ → กลับหน้ารายการ (ไม่เปิดฟอร์มเปล่าให้เข้าใจผิดว่าก๊อปมาแล้ว)
  if (searchParams?.copy && !copyFrom) redirect("/quotations");

  return <QuotationForm customers={(data ?? []) as Pick<Customer, "id" | "name" | "job" | "address">[]} copyFrom={copyFrom} />;
}
