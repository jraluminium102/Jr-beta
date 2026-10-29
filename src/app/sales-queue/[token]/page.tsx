import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSalesToken } from "@/lib/sales-link-token";
import { createServiceClient } from "@/lib/supabase/admin";
import { fetchAllPaged } from "@/lib/supabase/fetch-all";
import SalesQueueView, { type SqEntry, type SqSales, type SqAvail } from "./SalesQueueView";

/**
 * ลิงก์คิวประเมิน (มือถือ) ให้เซลล์ดู — ไม่ต้องล็อกอิน · ดูอย่างเดียว (เจ้าของสั่ง 29 ต.ค.69)
 *   เซลล์กดชื่อตัวเองดูคิว · ไม่มีปุ่มแก้ · ไม่มี API เขียน (หน้านี้อ่านฝั่ง server แล้วส่งข้อมูลลงไปเลย)
 *   ส่งเฉพาะคอลัมน์ที่เซลล์ต้องใช้ — ไม่ส่งข้อมูลออกบิล/โน้ต AI
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "คิวประเมิน · JR", robots: { index: false, follow: false } };

const PAST_DAYS = 14;
const AHEAD_DAYS = 60;
const COLS =
  "id, status, queue_date, queue_time, job_type, sales_id, assistant_id, line_contact, contact_channel, " +
  "customer_name, tel, address, location_url, lat, lng, job_size, job_count, assess_fee, fee_paid, note_admin";

// วันที่ไทย (UTC+7) — server Vercel เป็น UTC ห้ามใช้ new Date() ตรง ๆ
function thaiIso(offsetDays = 0): string {
  const d = new Date(Date.now() + 7 * 3600_000 + offsetDays * 86400_000);
  return d.toISOString().slice(0, 10);
}

export default async function SalesQueuePage({ params }: { params: { token: string } }) {
  const expected = await getSalesToken();
  if (!expected || params.token !== expected) notFound();

  const sb = createServiceClient() as unknown as { from: (t: string) => any };
  const today = thaiIso();
  const from = thaiIso(-PAST_DAYS);
  const to = thaiIso(AHEAD_DAYS);

  const [salesRes, entries, availRes] = await Promise.all([
    sb.from("queue_sales").select("id, name, team, role, parent_sales_id").eq("active", true).order("team").order("name"),
    fetchAllPaged<SqEntry>((a, b) =>
      sb.from("queue_entries").select(COLS)
        .neq("status", "CANCELLED")
        // คิวในช่วงวัน + คิวที่ยังไม่ลงวัน (รอจัด/เสนอคิว)
        .or(`and(queue_date.gte.${from},queue_date.lte.${to}),and(queue_date.is.null,status.in.(PENDING,PROPOSED))`)
        .order("queue_date", { ascending: true, nullsFirst: false })
        .order("queue_time", { ascending: true, nullsFirst: false })
        .order("id")
        .range(a, b)),
    sb.from("sales_availability").select("sales_id, date, kind, half, note").gte("date", from).lte("date", to),
  ]);

  return (
    <SalesQueueView
      today={today}
      sales={(salesRes.data ?? []) as SqSales[]}
      entries={entries}
      avail={(availRes.data ?? []) as SqAvail[]}
    />
  );
}
