// ตัวช่วยหา "เซลล์ที่ไปดูหน้างาน" ของแต่ละงาน
// ลำดับ: estimator (ถ้ามอบหมาย) → เซลล์จากคิว (queue_entries.job_id ย้อนกลับ →
// jobs.queue_entry_id forward → ชื่อลูกค้า) — งาน import ผูกคิวไม่สมมาตร เลยต้องครบ 3 ชั้น
// ใช้ร่วม: stats, ใบเสนอเช็คลิสต์, หน้าเขียนแบบ

type Sb = { from: (t: string) => any };
export type SalesResolvable = {
  id: string;
  queue_entry_id?: string | null;
  customer_name?: string | null;
  estimator_name?: string | null;
};

export async function buildSalesResolver(sb: Sb): Promise<(job: SalesResolvable) => string | null> {
  const [{ data: qe }, { data: qs }] = await Promise.all([
    sb.from("queue_entries").select("id, job_id, customer_name, sales_id"),
    sb.from("queue_sales").select("id, name"),
  ]);
  const idToName = new Map<string, string>((qs ?? []).map((s: any) => [s.id, s.name]));
  const byJob = new Map<string, string>();   // queue_entries.job_id → เซลล์ (FK ย้อนกลับ)
  const byQe = new Map<string, string>();     // queue_entries.id → เซลล์ (jobs.queue_entry_id)
  const byName = new Map<string, string>();   // ชื่อลูกค้า → เซลล์ (fallback เมื่อ FK ขาด)
  (qe ?? []).forEach((q: any) => {
    const nm = q.sales_id ? idToName.get(q.sales_id) : undefined;
    if (!nm) return;
    byQe.set(q.id, nm);
    if (q.job_id) byJob.set(q.job_id, nm);
    if (q.customer_name) byName.set(String(q.customer_name).trim(), nm);
  });
  return (job: SalesResolvable): string | null =>
    job.estimator_name
    ?? byJob.get(job.id)
    ?? (job.queue_entry_id ? byQe.get(job.queue_entry_id) : undefined)
    ?? (job.customer_name ? byName.get(String(job.customer_name).trim()) : undefined)
    ?? null;
}
