"use client";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, Check, X } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Spinner, EmptyState } from "@/components/ui/primitives";
import { IOS, type ProdSet } from "@/app/(app)/(oms)/production-schedule/page";

// ── หน้า QC หน้าเดียวสำหรับคนคิวซี — งานที่ส่งมาตรวจ (สถานะ "รอ QC") ──
// เช็คลิสต์เทคนิค + ผล (ผ่าน/ไม่ผ่าน) → ผ่าน=ส่งติดตั้ง · ไม่ผ่าน=กลับไปผลิต

type Row = {
  kind: "job" | "adhoc";
  id: string;            // production id
  job_id?: string | null;
  title: string;
  subtitle: string | null;
  job_code: string | null;
  customer_area: string | null;
  due_date: string | null;
  install_date: string | null;
  status: string;
  sets?: ProdSet[];
};

// เช็คลิสต์ QC มาตรฐาน งานอลูมิเนียม/กระจก (เทคนิค — ไม่ง่ายแบบช่าง)
const QC_ITEMS = [
  "ขนาดตรงตามแบบ (กว้าง × สูง)",
  "เฟรม/มุมฉาก เรียบร้อย ไม่บิดเบี้ยว",
  "บานเลื่อน/บานเปิด เปิด-ปิดลื่น ไม่ติด",
  "กระจกถูกสเปค ไม่มีรอย/ร้าว/บิ่น",
  "ยาแนว/ซีล/เส้นยาง ครบ แนบสนิท",
  "อุปกรณ์ครบ (มือจับ/กลอน/ล็อก/ลูกล้อ)",
  "มุ้ง/ตะแกรง เรียบร้อย (ถ้ามี)",
  "เก็บงาน/ทำความสะอาด เรียบร้อย",
];

const todayStr = () => new Date().toISOString().slice(0, 10);
const thShort = (d: string | null) => {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
};

export default function QcPage() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["production-schedule"],
    queryFn: () => api.get<Row[]>("/production-schedule"),
  });
  const canWrite = (data?.meta?.can_write as boolean) ?? false;
  const qcRows = useMemo(
    () => (data?.data ?? []).filter((r) => r.kind === "job" && r.status === "QC"),
    [data]
  );

  return (
    <div className="p-4 sm:p-6 fade-in rounded-2xl" style={{ background: IOS.page, minHeight: "calc(100vh - 24px)", color: IOS.ink }}>
      <h1 className="text-2xl font-bold flex items-center gap-2 mb-1" style={{ color: IOS.ink, letterSpacing: "-.01em" }}>
        <ShieldCheck size={22} /> ตรวจ QC
      </h1>
      <p className="text-[13px] mb-5" style={{ color: IOS.ink2 }}>
        งานที่ส่งมาตรวจ (รอ QC) · ติ๊กเช็คลิสต์ แล้วเลือกผล — ผ่าน = ส่งติดตั้ง · ไม่ผ่าน = ตีกลับไปผลิต
      </p>

      {isLoading ? <Spinner /> : qcRows.length === 0 ? (
        <EmptyState title="ไม่มีงานรอ QC" sub="งานจะเข้ามาเมื่อช่างกด 'ส่ง QC' ในตารางผลิต" />
      ) : (
        <div className="space-y-3">
          {qcRows.map((r) => <QcCard key={r.id} row={r} canWrite={canWrite} onDone={refetch} />)}
        </div>
      )}
    </div>
  );
}

function QcCard({ row, canWrite, onDone }: { row: Row; canWrite: boolean; onDone: () => void }) {
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [defects, setDefects] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const checkedCount = QC_ITEMS.filter((i) => checks[i]).length;
  const allChecked = checkedCount === QC_ITEMS.length;

  const submit = async (result: "PASSED" | "FAILED") => {
    if (!row.job_id) { setErr("งานนี้ไม่มี job_id"); return; }
    if (result === "FAILED" && !defects.trim()) { setErr("กรุณาระบุจุดที่ไม่ผ่าน"); return; }
    // กันกดไม่ผ่านโดยไม่ได้ตรวจเลย
    if (result === "FAILED" && checkedCount === 0 && !confirm("ยังไม่ได้ติ๊กเช็คลิสต์เลย — ยืนยันว่าไม่ผ่าน?")) return;
    setBusy(true); setErr(null);
    try {
      // 1) บันทึกผล QC + เช็คลิสต์ (audit) — ถ้าขั้น 2 พลาด งานยังอยู่ QC กดซ้ำได้
      await api.post("/qc", { job_id: row.job_id, stage: "FACTORY", result, defects: defects || undefined, checklist: checks });
      // 2) เลื่อนสถานะงานผลิต
      if (result === "PASSED") {
        await api.patch(`/production/${row.id}`, { status: "READY", qc_result: "PASSED", qc_date: todayStr() });
      } else {
        await api.patch(`/production/${row.id}`, { status: "MANUFACTURING", qc_result: "FAILED", qc_note: defects });
      }
      onDone();
      // ไม่ปลด busy — การ์ดจะหายจากลิสต์ (refetch) กันกดซ้ำ
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "บันทึกไม่สำเร็จ");
      setBusy(false);
    }
  };

  return (
    <div className="rounded-[18px] p-4" style={{ background: IOS.card, boxShadow: "0 1px 3px rgba(0,0,0,.06), 0 6px 16px rgba(0,0,0,.04)" }}>
      {/* หัวงาน */}
      <div className="flex items-center gap-2 flex-wrap mb-1">
        <span className="font-bold text-[16px]" style={{ color: IOS.ink, letterSpacing: "-.01em" }}>{row.title}</span>
        {row.job_code && <span className="text-[10px] tnum rounded-md px-1.5 py-0.5 font-semibold" style={{ background: "#eaf3ff", color: IOS.blue }}>{row.job_code}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mb-3 text-[12.5px]" style={{ color: IOS.ink2 }}>
        {row.customer_area && <span>📍 {row.customer_area}</span>}
        {row.due_date && <span className="tnum">⏰ กำหนดเสร็จ {thShort(row.due_date)}</span>}
        {row.install_date && <span className="tnum">🔧 ติดตั้ง {thShort(row.install_date)}</span>}
      </div>

      {/* สเปคชุดงาน (อ้างอิงตอนตรวจ) */}
      {row.sets && row.sets.length > 0 && (
        <div className="rounded-xl px-3 py-2 mb-3 text-[12px] space-y-0.5" style={{ background: IOS.inset, color: IOS.ink2 }}>
          {row.sets.map((s) => (
            <div key={s.id} className="flex flex-wrap gap-x-2">
              <span className="font-semibold" style={{ color: IOS.ink }}>{s.set_label || "ชุดงาน"}:</span>
              {s.glass_spec && <span>🟦 {s.glass_spec}</span>}
              {s.screen_type && <span>🪟 {s.screen_type}</span>}
            </div>
          ))}
        </div>
      )}

      {/* เช็คลิสต์ */}
      <div className="space-y-1.5 mb-3">
        {QC_ITEMS.map((item) => {
          const on = !!checks[item];
          return (
            <button key={item} type="button" disabled={!canWrite}
              onClick={() => setChecks((c) => ({ ...c, [item]: !c[item] }))}
              className="focusable w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13.5px] min-h-[44px] transition disabled:opacity-60"
              style={on ? { background: "#e3f8ea", color: "#1a7d4f" } : { background: IOS.inset, color: IOS.ink }}>
              <span className="w-5 h-5 rounded-md inline-flex items-center justify-center shrink-0 border"
                style={on ? { background: IOS.green, borderColor: IOS.green } : { background: "#fff", borderColor: "#c7c7cc" }}>
                {on && <Check size={14} color="#fff" />}
              </span>
              {item}
            </button>
          );
        })}
      </div>
      <div className="text-[12px] mb-2" style={{ color: allChecked ? "#1a7d4f" : IOS.ink3 }}>
        ติ๊กแล้ว {checkedCount}/{QC_ITEMS.length} ข้อ {allChecked && "· ครบ ✓"}
      </div>

      {/* จุดบกพร่อง (บังคับถ้าไม่ผ่าน) */}
      <textarea value={defects} onChange={(e) => setDefects(e.target.value)} rows={2} disabled={!canWrite}
        placeholder="จุดบกพร่อง / หมายเหตุ (บังคับถ้าไม่ผ่าน)"
        className="w-full rounded-xl px-3 py-2.5 text-[13px] outline-none resize-none mb-3 border disabled:opacity-60"
        style={{ background: "#fff", borderColor: IOS.line, color: IOS.ink }} />

      {err && <p role="alert" className="text-[13px] mb-2" style={{ color: IOS.red }}>{err}</p>}

      {/* ปุ่มผล */}
      {canWrite ? (
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => submit("FAILED")} disabled={busy}
            className="focusable pressable inline-flex items-center justify-center gap-1.5 rounded-xl text-white text-[14px] font-bold min-h-[50px] disabled:opacity-50"
            style={{ background: IOS.red }}>
            <X size={16} /> ไม่ผ่าน → ตีกลับ
          </button>
          <button onClick={() => submit("PASSED")} disabled={busy || !allChecked}
            title={allChecked ? "" : "ติ๊กเช็คลิสต์ให้ครบก่อน"}
            className="focusable pressable inline-flex items-center justify-center gap-1.5 rounded-xl text-white text-[14px] font-bold min-h-[50px] disabled:opacity-40"
            style={{ background: IOS.green }}>
            <Check size={16} /> ผ่าน → ส่งติดตั้ง
          </button>
        </div>
      ) : (
        <p className="text-[12px]" style={{ color: IOS.ink3 }}>บทบาทนี้ดูได้อย่างเดียว</p>
      )}
    </div>
  );
}
