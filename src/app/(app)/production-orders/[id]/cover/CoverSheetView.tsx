"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type { ProductionOrder } from "@/lib/types";
import Icon from "@/components/Icon";

// ─── Types ────────────────────────────────────────────────────────────────────

type Derived = {
  prepare: string[];
  installerPrefill: string[];
  customerPrefill: string[];
};

type Saved = {
  installer_notes: string;
  customer_notes: string;
  warning_left: string;
  warning_right: string;
  updated_at: string;
} | null;

type CoverSheetData = {
  order: Pick<ProductionOrder, "id" | "code" | "customer_snapshot" | "items" | "due_date" | "status">;
  derived: Derived;
  saved: Saved;
};

type CustomerSnapshot = {
  name?: string;
  job?: string;
  contact_person?: string;
  phone?: string;
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CoverSheetView({
  orderId,
  canEdit,
}: {
  orderId: string;
  canEdit: boolean;
}) {
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery<CoverSheetData>({
    queryKey: ["cover-sheet", orderId],
    queryFn: () =>
      api.get<CoverSheetData>(`/cover-sheets/${orderId}`).then((r) => r.data),
  });

  // ─── editable fields ─────────────────────────────────────────────────────
  const [warningLeft,  setWarningLeft]  = useState("");
  const [warningRight, setWarningRight] = useState("");
  const [installerNotes, setInstallerNotes] = useState("");
  const [customerNotes,  setCustomerNotes]  = useState("");
  const [dirty,    setDirty]    = useState(false);
  const [saveError, setSaveError] = useState("");
  const initialized = useRef(false);

  // sync state from server data (only on first load)
  useEffect(() => {
    if (!data || initialized.current) return;
    initialized.current = true;

    const s = data.saved;
    setWarningLeft(s?.warning_left  ?? "");
    setWarningRight(s?.warning_right ?? "");
    setInstallerNotes(
      s?.installer_notes && s.installer_notes.trim()
        ? s.installer_notes
        : data.derived.installerPrefill.map((l) => `- ${l}`).join("\n")
    );
    setCustomerNotes(
      s?.customer_notes && s.customer_notes.trim()
        ? s.customer_notes
        : data.derived.customerPrefill.map((l) => `- ${l}`).join("\n")
    );
  }, [data]);

  const saveMut = useMutation({
    mutationFn: () =>
      api.put(`/cover-sheets/${orderId}`, {
        installer_notes: installerNotes,
        customer_notes:  customerNotes,
        warning_left:    warningLeft,
        warning_right:   warningRight,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cover-sheet", orderId] });
      setDirty(false);
      setSaveError("");
    },
    onError: (e) => setSaveError(e instanceof ApiError ? e.message : "บันทึกไม่สำเร็จ"),
  });

  function markDirty() { setDirty(true); }

  // ─── loading / error states ───────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-ink-3 gap-2">
        <span className="w-4 h-4 rounded-full border-2 border-gray-300 border-t-brand animate-spin" />
        กำลังโหลดใบปะหน้า…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-sm text-red-500 py-10 text-center">
        โหลดข้อมูลไม่สำเร็จ
      </div>
    );
  }

  const { order, derived } = data;
  const c = order.customer_snapshot as CustomerSnapshot;

  return (
    <>
      {/* ─── Print CSS ────────────────────────────────────────────────────── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap');
        @page { size: A4 portrait; margin: 15mm 12mm; }
        @media print {
          .no-print { display: none !important; }
          body { font-family: 'Sarabun', sans-serif; font-size: 13px; color: #111; }
          .cover-wrap { max-width: 100%; padding: 0; background: none !important; box-shadow: none !important; border: none !important; }
          .cover-header { margin-bottom: 10px; }
          .cover-table { width: 100%; border-collapse: collapse; }
          .cover-table th, .cover-table td { border: 1px solid #555; padding: 5px 7px; vertical-align: top; font-size: 12px; }
          .cover-table th { font-weight: 700; text-decoration: underline; text-align: center; font-size: 12px; background: none; color: #111; }
          .col-prepare { width: 33%; }
          .col-installer { width: 33%; color: #c00; }
          .col-customer  { width: 34%; color: #c00; }
          textarea { border: none !important; outline: none !important; background: transparent !important; resize: none !important; color: #c00 !important; padding: 0 !important; width: 100% !important; min-height: unset !important; height: auto !important; font-size: 12px !important; font-family: 'Sarabun', sans-serif !important; white-space: pre-wrap; }
          .warning-left  { color: #c00 !important; font-weight: 700; font-size: 12px; }
          .warning-right { color: #c00 !important; font-weight: 700; font-size: 12px; }
          .warning-left-input, .warning-right-input { border: none !important; background: transparent !important; color: #c00 !important; font-weight: 700; font-size: 12px !important; font-family: 'Sarabun', sans-serif !important; }
        }
      `}</style>

      {/* ─── Screen toolbar (no-print) ────────────────────────────────────── */}
      <div className="no-print mb-5 flex items-center gap-3 flex-wrap">
        <Link
          href={`/production-orders/${orderId}`}
          className="press glass-soft w-10 h-10 rounded-xl inline-flex items-center justify-center text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand"
          aria-label="ย้อนกลับ"
        >
          <Icon name="arrowLeft" size={18} />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-brand-dark">ใบปะหน้างาน</h1>
          <div className="text-sm text-ink-2">{order.code} · {c.name ?? "—"}</div>
        </div>

        <div className="flex items-center gap-2">
          {canEdit && dirty && (
            <button
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending}
              className="press bg-brand text-white rounded-xl px-4 py-2.5 text-sm font-semibold min-h-[44px] focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-50"
            >
              {saveMut.isPending ? "กำลังบันทึก…" : "บันทึก"}
            </button>
          )}
          <button
            onClick={() => window.print()}
            className="press glass-soft rounded-xl px-4 py-2.5 text-sm font-semibold text-brand-dark inline-flex items-center gap-2 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-brand"
          >
            <Icon name="printer" size={16} />
            พิมพ์ / PDF
          </button>
        </div>
      </div>

      {saveError && (
        <div className="no-print mb-3 text-sm text-red-500">{saveError}</div>
      )}

      {/* ─── Cover Sheet Body ─────────────────────────────────────────────── */}
      <div className="cover-wrap glass rounded-2xl p-6 print:p-0 print:shadow-none">

        {/* หัวกระดาษ: ชื่อลูกค้าตรงกลาง + คำเตือนซ้าย/ขวา */}
        <div
          className="cover-header mb-4"
          style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: "8px" }}
        >
          {/* คำเตือนซ้าย */}
          <div className="warning-left" style={{ textAlign: "left" }}>
            {canEdit ? (
              <input
                value={warningLeft}
                onChange={(e) => { setWarningLeft(e.target.value); markDirty(); }}
                placeholder="คำเตือน (ซ้าย)"
                className="warning-left-input no-print text-red-600 font-bold text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-1.5 w-full focus:outline-none focus:ring-2 focus:ring-red-300 min-h-[38px]"
              />
            ) : (
              warningLeft
                ? <span className="text-red-600 font-bold text-sm">*{warningLeft}*</span>
                : null
            )}
            {/* print: show value inline */}
            {canEdit && warningLeft && (
              <span className="hidden print:inline text-red-600 font-bold">*{warningLeft}*</span>
            )}
          </div>

          {/* ชื่อลูกค้าตรงกลาง — "ชื่อลูกค้า [ชื่อจริง]" บรรทัดเดียว มีเส้นใต้ (ตรงใบจริง) */}
          <div style={{ textAlign: "center" }}>
            <div
              className="font-bold"
              style={{ fontSize: "16px", borderBottom: "1px solid #999", paddingBottom: "2px", minWidth: "180px" }}
            >
              <span className="text-ink-3" style={{ fontWeight: 400, fontSize: "13px", marginRight: "8px" }}>ชื่อลูกค้า</span>
              {c.name
                ? <>
                    {/* ชื่อหลัก */}
                    {c.name.split(/[()（）]/)[0].trim()}
                    {/* ชื่อเล่นในวงเล็บ ถ้ามี */}
                    {c.name.match(/[（(]([^)）]+)[)）]/)
                      ? <span style={{ marginLeft: "8px" }}>
                          ({c.name.match(/[（(]([^)）]+)[)）]/)![1]})
                        </span>
                      : null
                    }
                  </>
                : "—"
              }
            </div>
          </div>

          {/* คำเตือนขวา */}
          <div className="warning-right" style={{ textAlign: "right" }}>
            {canEdit ? (
              <input
                value={warningRight}
                onChange={(e) => { setWarningRight(e.target.value); markDirty(); }}
                placeholder="คำเตือน (ขวา)"
                className="warning-right-input no-print text-red-600 font-bold text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-1.5 w-full focus:outline-none focus:ring-2 focus:ring-red-300 min-h-[38px] text-right"
              />
            ) : (
              warningRight
                ? <span className="text-red-600 font-bold text-sm">*{warningRight}*</span>
                : null
            )}
            {canEdit && warningRight && (
              <span className="hidden print:inline text-red-600 font-bold">*{warningRight}*</span>
            )}
          </div>
        </div>

        {/* ตาราง 3 คอลัมน์ */}
        <table
          className="cover-table w-full"
          style={{ borderCollapse: "collapse", tableLayout: "fixed" }}
        >
          <colgroup>
            <col style={{ width: "33%" }} />
            <col style={{ width: "33%" }} />
            <col style={{ width: "34%" }} />
          </colgroup>
          <thead>
            <tr>
              <th
                className="col-prepare"
                style={{
                  border: "1px solid #555", padding: "6px 8px",
                  textDecoration: "underline", fontWeight: 700,
                  fontSize: "13px", backgroundColor: "transparent",
                  textAlign: "center",
                }}
              >
                รายละเอียด สั่งของเตรียมผลิต
              </th>
              <th
                className="col-installer"
                style={{
                  border: "1px solid #555", padding: "6px 8px",
                  textDecoration: "underline", fontWeight: 700,
                  fontSize: "13px", backgroundColor: "transparent",
                  textAlign: "center",
                }}
              >
                รายละเอียด แจ้งช่างตอนติดตั้ง
              </th>
              <th
                className="col-customer"
                style={{
                  border: "1px solid #555", padding: "6px 8px",
                  textDecoration: "underline", fontWeight: 700,
                  fontSize: "13px", backgroundColor: "transparent",
                  textAlign: "center",
                }}
              >
                รายละเอียดแจ้งลูกค้า+เตรียมของติดตั้ง
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              {/* คอลัมน์ ① — อ่านอย่างเดียว (auto จาก derived) */}
              <td
                className="col-prepare"
                style={{
                  border: "1px solid #555", padding: "6px 8px",
                  verticalAlign: "top", fontSize: "13px",
                }}
              >
                {derived.prepare.length > 0 ? (
                  <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.7 }}>
                    {derived.prepare.map((line, i) => (
                      <div key={i}>- {line}</div>
                    ))}
                  </div>
                ) : (
                  <span className="text-ink-3 text-xs">—</span>
                )}
              </td>

              {/* คอลัมน์ ② — แก้ได้ */}
              <td
                className="col-installer"
                style={{
                  border: "1px solid #555", padding: "4px 6px",
                  verticalAlign: "top",
                }}
              >
                {canEdit ? (
                  <textarea
                    value={installerNotes}
                    onChange={(e) => { setInstallerNotes(e.target.value); markDirty(); }}
                    placeholder="- รายละเอียดแจ้งช่าง"
                    rows={Math.max(8, (installerNotes.split("\n").length || 1) + 2)}
                    className="w-full text-sm resize-none bg-transparent border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand text-red-600 print:border-none print:p-0"
                    style={{ minHeight: "120px", lineHeight: 1.7, fontFamily: "inherit" }}
                  />
                ) : (
                  <div style={{ whiteSpace: "pre-wrap", fontSize: "13px", lineHeight: 1.7, color: "#c00" }}>
                    {installerNotes || <span style={{ color: "#aaa" }}>—</span>}
                  </div>
                )}
              </td>

              {/* คอลัมน์ ③ — แก้ได้ */}
              <td
                className="col-customer"
                style={{
                  border: "1px solid #555", padding: "4px 6px",
                  verticalAlign: "top",
                }}
              >
                {canEdit ? (
                  <textarea
                    value={customerNotes}
                    onChange={(e) => { setCustomerNotes(e.target.value); markDirty(); }}
                    placeholder="- รายละเอียดแจ้งลูกค้า"
                    rows={Math.max(8, (customerNotes.split("\n").length || 1) + 2)}
                    className="w-full text-sm resize-none bg-transparent border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand text-red-600 print:border-none print:p-0"
                    style={{ minHeight: "120px", lineHeight: 1.7, fontFamily: "inherit" }}
                  />
                ) : (
                  <div style={{ whiteSpace: "pre-wrap", fontSize: "13px", lineHeight: 1.7, color: "#c00" }}>
                    {customerNotes || <span style={{ color: "#aaa" }}>—</span>}
                  </div>
                )}
              </td>
            </tr>
          </tbody>
        </table>

        {/* footer — screen only */}
        {data.saved?.updated_at && (
          <p className="no-print mt-3 text-[11px] text-ink-3 text-right">
            บันทึกล่าสุด: {new Date(data.saved.updated_at).toLocaleString("th-TH")}
          </p>
        )}
      </div>
    </>
  );
}
