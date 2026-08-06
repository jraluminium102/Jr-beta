import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile, canWrite } from "@/lib/auth";
import Icon from "@/components/Icon";
import FloorEditor from "@/components/floor/FloorEditor";
import { loadFloorJobs } from "../new/page";

export const dynamic = "force-dynamic";

export default async function FloorWorkPage({ params }: { params: { id: string } }) {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const supabase = createClient();
  const { data } = await supabase
    .from("floor_quotations")
    .select("*, floor_quotation_items(*)")
    .eq("id", params.id)
    .single();
  if (!data) notFound();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = data as any;
  const jobs = await loadFloorJobs();
  const revLabel = q.rev > 0 ? ` (Rev${String(q.rev).padStart(2, "0")})` : "";

  return (
    <div className="space-y-4">
      <Link href="/floor-works" className="press inline-flex items-center gap-1.5 text-sm text-ink-2">
        <Icon name="arrowLeft" size={16} /> กลับ
      </Link>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-extrabold text-ink">
            <span className="font-mono">{q.code}</span>{revLabel}
          </h1>
          <p className="text-sm text-ink-3">{q.customer_snapshot?.name ?? "—"} · {q.issue_date}</p>
        </div>
        <div className="flex gap-2">
          <Link href={`/floor-works/${q.id}/print`} target="_blank"
            className="press rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium">พิมพ์ใบเสนอ / PDF</Link>
          <a href={`/api/floor-quotations/${q.id}/xlsx`}
            className="press rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium">Excel</a>
          <Link href={`/floor-works/${q.id}/installments`}
            className="press rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium">ใบเบิกงวด</Link>
        </div>
      </div>

      {q.status === "cancelled" ? (
        <div className="card p-6 text-center text-red-700">ใบนี้ยกเลิกแล้ว — แก้ไขไม่ได้</div>
      ) : canWrite(profile.role) ? (
        <FloorEditor mode="edit" initial={q} jobs={jobs} />
      ) : (
        <div className="card p-6 text-center text-ink-3">คุณไม่มีสิทธิ์แก้ไขใบเสนอราคา</div>
      )}
    </div>
  );
}
