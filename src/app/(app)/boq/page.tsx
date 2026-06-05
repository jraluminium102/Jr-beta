import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { Card, Badge } from "@/components/ui";
import Icon from "@/components/Icon";
import NewBoqButton, { type BoqQuotationOption } from "@/components/boq/NewBoqButton";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  draft: "ร่าง", confirmed: "ยืนยันแล้ว", ordered: "สั่งซื้อแล้ว",
};
const STATUS_TONE: Record<string, "gray" | "amber" | "emerald"> = {
  draft: "gray", confirmed: "amber", ordered: "emerald",
};

type BoqRow = {
  id: number;
  code: string;
  customer_snapshot: { name?: string } | null;
  status: string;
  created_at: string;
  job: { job_code: string } | null;
};

export default async function BoqListPage() {
  const profile = await getProfile();
  const supabase = createClient();

  const [{ data: boqData }, { data: quoData }] = await Promise.all([
    supabase
      .from("boqs")
      .select("id, code, customer_snapshot, status, created_at, job:job_id(job_code)")
      .order("created_at", { ascending: false }),
    supabase
      .from("quotations")
      .select("id, code, customer_snapshot")
      .eq("status", "approved")
      .order("created_at", { ascending: false }),
  ]);

  const rows = (boqData ?? []) as unknown as BoqRow[];
  const quotations = (quoData ?? []) as unknown as BoqQuotationOption[];
  const writable = can(profile!.role, "boq", "write");

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-brand-dark flex items-center gap-2.5">
          <span className="text-white rounded-xl w-9 h-9 inline-flex items-center justify-center bg-brand shadow-brand">
            <Icon name="boxes" size={18} />
          </span>
          BOQ ตัดอลู
        </h1>
        {writable && <NewBoqButton quotations={quotations} />}
      </div>

      <Card className="p-5">
        {rows.length === 0 ? (
          <div className="text-center py-12 text-ink-3">
            <p>ยังไม่มี BOQ</p>
            <p className="text-xs mt-1">สร้าง BOQ จากใบเสนอราคาที่อนุมัติแล้ว</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ink-3">
                  <th className="py-2 font-semibold">รหัส</th>
                  <th className="font-semibold">ลูกค้า</th>
                  <th className="font-semibold">งาน</th>
                  <th className="font-semibold">วันที่สร้าง</th>
                  <th className="font-semibold">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-gray-200/70 hover:bg-white/50">
                    <td className="py-3">
                      <Link href={`/boq/${r.id}`} className="font-mono font-semibold text-brand-dark hover:underline">{r.code}</Link>
                    </td>
                    <td className="font-medium">{r.customer_snapshot?.name ?? "—"}</td>
                    <td className="text-ink-2 font-mono text-xs">{r.job?.job_code ?? "—"}</td>
                    <td className="text-ink-2">{r.created_at?.slice(0, 10)}</td>
                    <td><Badge tone={STATUS_TONE[r.status] ?? "gray"} dot>{STATUS_LABEL[r.status] ?? r.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
