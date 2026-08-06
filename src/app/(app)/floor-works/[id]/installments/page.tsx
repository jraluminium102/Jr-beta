import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile, canWrite } from "@/lib/auth";
import Icon from "@/components/Icon";
import InstallmentEditor from "@/components/floor/InstallmentEditor";

export const dynamic = "force-dynamic";

export default async function FloorInstallmentsPage({ params }: { params: { id: string } }) {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const supabase = createClient();
  const { data } = await supabase
    .from("floor_quotations")
    .select("*, floor_quotation_items(name, sort_order), floor_installments(*)")
    .eq("id", params.id)
    .single();
  if (!data) notFound();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = data as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = ((q.floor_installments ?? []) as any[])
    .slice()
    .sort((a, b) => a.seq - b.seq)
    .map((r) => ({
      seq: r.seq, label: r.label, amount: Number(r.amount) || 0,
      work_items: r.work_items ?? "", is_final: !!r.is_final,
    }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const itemNames = ((q.floor_quotation_items ?? []) as any[])
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((it) => String(it.name ?? "").trim())
    .filter(Boolean);

  return (
    <div className="space-y-4">
      <Link href={`/floor-works/${q.id}`} className="press inline-flex items-center gap-1.5 text-sm text-ink-2">
        <Icon name="arrowLeft" size={16} /> กลับใบเสนอ
      </Link>
      <div>
        <h1 className="text-xl font-extrabold text-ink">ใบเบิกงวดงานพื้น</h1>
        <p className="text-sm text-ink-3">
          <span className="font-mono">{q.code}</span> · {q.customer_snapshot?.name ?? "—"}
        </p>
      </div>

      {canWrite(profile.role) ? (
        <InstallmentEditor
          quotationId={q.id}
          quoteTotal={Number(q.total) || 0}
          initial={rows}
          itemNames={itemNames}
        />
      ) : (
        <div className="card p-6 text-center text-ink-3">คุณไม่มีสิทธิ์แก้ไข</div>
      )}
    </div>
  );
}
