"use client";

/**
 * ใบตัด / BOQ — หน้ารายการ + สร้างใบตัด
 * สร้างได้ 2 ทาง: (1) จากงานลูกค้า — ดึงข้อจากใบเสนอ (สูตร 0093) อัตโนมัติ · (2) ใบเปล่า กรอกมือ
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, Badge } from "@/components/ui";
import Icon from "@/components/Icon";

type Row = {
  id: number; code: string; name: string; status: string; job_id: string | null;
  created_at: string; stock_cut_at: string | null;
  jobs?: { job_code: string | null; customer_name: string | null } | null;
};
type JobOpt = { id: string; job_code: string | null; customer_name: string };

export default function CutlistListClient({ rows, jobs, canWrite }: { rows: Row[]; jobs: JobOpt[]; canWrite: boolean }) {
  const router = useRouter();
  const [jobId, setJobId] = useState("");
  const [jobQuery, setJobQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const jobFiltered = useMemo(() => {
    const q = jobQuery.trim().toLowerCase();
    if (!q) return jobs.slice(0, 100);
    return jobs.filter((j) => (j.customer_name ?? "").toLowerCase().includes(q) || (j.job_code ?? "").toLowerCase().includes(q)).slice(0, 100);
  }, [jobs, jobQuery]);

  // ลบใบร่างที่เทสทิ้งถาวร — server กันเฉพาะ draft (ใบที่ตัดสต็อกแล้วลบไม่ได้)
  async function del(id: number, code: string) {
    if (!window.confirm(`ลบใบตัด ${code} ทิ้งถาวร?\n(ลบได้เฉพาะใบร่างที่ยังไม่ตัดสต็อก — ไว้เคลียร์ใบที่สร้างเทส)`)) return;
    setBusy(true); setErr("");
    try {
      const res = await fetch(`/api/cutlists/${id}`, { method: "DELETE" });
      const json = await res.json().catch(() => null);
      if (!res.ok) { setErr(json?.error ?? "ลบไม่สำเร็จ"); return; }
      router.refresh();
    } finally { setBusy(false); }
  }

  async function create(fromJob: boolean) {
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/cutlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fromJob ? { job_id: jobId, from_job: true } : (jobId ? { job_id: jobId } : {})),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) { setErr(json?.error ?? `สร้างไม่สำเร็จ (${res.status})`); return; }
      const skipped: string[] = json?.data?.skipped ?? [];
      if (skipped.length) {
        // ข้อที่ดึงจากใบเสนอไม่ได้ (รุ่นยังไม่มีสูตรตัด/พิมพ์มือ/ห้องกระจก) — แจ้งก่อนเข้า editor
        alert(`ดึงจากใบเสนอได้ ${json?.data?.item_count ?? 0} ข้อ · ข้าม ${skipped.length} ข้อ (ยังไม่มีสูตรตัดของรุ่น/ข้อพิมพ์มือ):\n- ${skipped.join("\n- ")}\n\nเพิ่มเองในใบตัดได้`);
      }
      router.push(`/cutlist/${json?.data?.id}`);
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-brand-dark flex items-center gap-2.5">
          <span className="text-white rounded-xl w-9 h-9 inline-flex items-center justify-center bg-brand shadow-brand"><Icon name="box" size={18} /></span>
          ใบตัด / BOQ
        </h1>
      </div>
      <p className="text-sm text-ink-3 -mt-3">
        ใบตัดอลูต่องาน → สรุปเส้นต่อรหัส (BOQ) → กด &quot;ตัดสต็อก&quot; หักจริงตาม sku · ดึงข้อจากใบเสนอ (เครื่องคิดราคา 4.0) อัตโนมัติ
      </p>

      {canWrite && (
        <Card className="p-4 space-y-2.5">
          <div className="text-sm font-semibold text-brand-dark">สร้างใบตัดใหม่</div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="block flex-1 min-w-[220px]">
              <span className="text-xs font-medium text-ink-3">ค้นหางาน (ชื่อลูกค้า / รหัสงาน)</span>
              <input value={jobQuery} onChange={(e) => setJobQuery(e.target.value)} placeholder="เช่น คุณตะวัน / JR2026-218"
                className="w-full glass-soft rounded-lg px-3 py-2 mt-1 outline-none" />
            </label>
            <label className="block flex-1 min-w-[260px]">
              <span className="text-xs font-medium text-ink-3">งานลูกค้า</span>
              <select value={jobId} onChange={(e) => setJobId(e.target.value)} className="w-full glass-soft rounded-lg px-3 py-2 mt-1 outline-none">
                <option value="">— ไม่ผูกงาน (ใบเปล่า) —</option>
                {jobFiltered.map((j) => (
                  <option key={j.id} value={j.id}>{j.customer_name}{j.job_code ? ` · ${j.job_code}` : ""}</option>
                ))}
              </select>
            </label>
            <button onClick={() => create(true)} disabled={busy || !jobId}
              title="ดึงข้อจากใบเสนอล่าสุดของงาน (เฉพาะข้อที่มีสูตรตัดของรุ่น)"
              className="press rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-brand shadow-brand disabled:opacity-50">
              + สร้างจากงาน (ดึงใบเสนอ)
            </button>
            <button onClick={() => create(false)} disabled={busy}
              className="press rounded-xl px-4 py-2.5 text-sm font-semibold glass-soft text-ink-2 disabled:opacity-50">
              + ใบเปล่า (กรอกมือ)
            </button>
          </div>
          {err && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{err}</p>}
        </Card>
      )}

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-3 text-xs border-b border-black/5 bg-black/[0.02]">
                <th className="px-3 py-2 font-medium">เลขที่</th>
                <th className="px-3 py-2 font-medium">ชื่อใบตัด</th>
                <th className="px-3 py-2 font-medium">งาน / ลูกค้า</th>
                <th className="px-3 py-2 font-medium">วันที่</th>
                <th className="px-3 py-2 font-medium text-center">สถานะ</th>
                {canWrite && <th className="px-3 py-2 font-medium text-center w-10"></th>}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={canWrite ? 6 : 5} className="px-3 py-8 text-center text-ink-3">ยังไม่มีใบตัด — สร้างใบแรกด้านบน</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-black/5 last:border-0 hover:bg-white/60">
                  <td className="px-3 py-2">
                    <Link href={`/cutlist/${r.id}`} className="font-mono text-brand-dark font-semibold hover:underline">{r.code || `CL-${r.id}`}</Link>
                  </td>
                  <td className="px-3 py-2">
                    <Link href={`/cutlist/${r.id}`} className="hover:underline">{r.name || "—"}</Link>
                  </td>
                  <td className="px-3 py-2 text-ink-2">
                    {r.jobs ? `${r.jobs.customer_name ?? ""}${r.jobs.job_code ? ` · ${r.jobs.job_code}` : ""}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-ink-3 text-xs">{String(r.created_at ?? "").slice(0, 10)}</td>
                  <td className="px-3 py-2 text-center">
                    {r.status === "stock_cut"
                      ? <Badge tone="emerald" dot>ตัดสต็อกแล้ว</Badge>
                      : <Badge tone="gray" dot>ร่าง</Badge>}
                  </td>
                  {canWrite && (
                    <td className="px-3 py-2 text-center">
                      {r.status === "stock_cut"
                        ? <span title="ตัดสต็อกแล้ว ลบไม่ได้" className="text-ink-3/40 text-xs">🔒</span>
                        : <button onClick={() => del(r.id, r.code || `CL-${r.id}`)} disabled={busy}
                            title="ลบใบร่างที่เทสทิ้ง (ลบได้เฉพาะใบยังไม่ตัดสต็อก)"
                            className="press px-2 py-1 rounded-lg text-red-600 hover:bg-red-50 text-xs disabled:opacity-50">🗑</button>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
