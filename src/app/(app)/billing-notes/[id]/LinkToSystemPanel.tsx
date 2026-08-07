"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import Icon from "@/components/Icon";
import { baht } from "@/lib/money";

// "ดึงใบวางบิลนอกระบบเข้าระบบ" — ผูกบิลที่ออกไปก่อน เข้ากับใบเสนอราคาที่ออกทีหลัง
//   โชว์เฉพาะบิลที่ยังไม่มี quotation_id · ยอดบิลไม่ถูกแก้ (ส่งลูกค้าไปแล้ว) — ยอดไม่ตรงแค่เตือน

export type LinkableQuotation = {
  id: number;
  code: string;
  net: number;
  job_id: string | null;
  customer_snapshot: { name?: string; job?: string } | null;
};

export default function LinkToSystemPanel({
  billingNoteId,
  billTotal,
  quotations,
}: {
  billingNoteId: number;
  billTotal: number;
  quotations: LinkableQuotation[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [qid, setQid] = useState<number | "">("");
  const [syncCustomer, setSyncCustomer] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<{ code: string; backfilled: number; warnings: string[] } | null>(null);

  const selected = useMemo(() => quotations.find((q) => q.id === qid) ?? null, [quotations, qid]);
  const mismatch = selected && Math.abs((Number(selected.net) || 0) - billTotal) > 0.5;

  async function submit() {
    if (busyRef.current) return;
    setErr("");
    if (!qid) { setErr("เลือกใบเสนอราคาที่จะผูก"); return; }
    busyRef.current = true; setBusy(true);
    try {
      const res = await fetch(`/api/billing-notes/${billingNoteId}/link`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quotation_id: qid, sync_customer: syncCustomer }),
      });
      const json = await res.json();
      if (!res.ok) { setErr(json.error ?? "ผูกไม่สำเร็จ"); return; }
      setDone({ code: json.data.quotation_code, backfilled: json.data.backfilled, warnings: json.data.warnings ?? [] });
      router.refresh();
    } catch {
      setErr("เกิดข้อผิดพลาด กรุณาลองใหม่");
    } finally {
      busyRef.current = false; setBusy(false);
    }
  }

  if (done) {
    return (
      <Card className="p-5 border-emerald-200 bg-emerald-50">
        <div className="font-semibold text-emerald-800 flex items-center gap-2">
          <Icon name="link" size={16} /> ผูกเข้าระบบแล้ว → ใบเสนอ {done.code}
        </div>
        <p className="text-sm text-emerald-800 mt-1">
          {done.backfilled > 0
            ? `ลงบัญชีย้อนหลังให้ ${done.backfilled} งวดที่รับเงินไปแล้ว`
            : "ไม่มีงวดที่รับเงินไปแล้ว — เงินงวดถัดไปจะลงบัญชีอัตโนมัติ"}
        </p>
        {done.warnings.map((w, i) => (
          <p key={i} className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">⚠ {w}</p>
        ))}
      </Card>
    );
  }

  return (
    <Card className="p-5 border-sky-200 bg-sky-50/60">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-semibold text-sky-900 flex items-center gap-2">
            <Icon name="link" size={16} /> ใบวางบิลนอกระบบ — ยังไม่ผูกใบเสนอราคา/งาน
          </div>
          <p className="text-xs text-sky-800 mt-0.5">
            ออกใบเสนอราคาให้ลูกค้ารายนี้แล้วค่อยกดผูก — เงินที่รับไปแล้วจะถูกลงบัญชี/ค้างรับย้อนหลังให้
          </p>
        </div>
        <button
          type="button" onClick={() => setOpen((v) => !v)}
          className="press bg-brand text-white rounded-xl px-4 py-2 text-sm font-semibold shadow-brand"
        >
          {open ? "ปิด" : "ผูกเข้าระบบ"}
        </button>
      </div>

      {open && (
        <div className="mt-4 space-y-3">
          {quotations.length === 0 ? (
            <p className="text-sm text-ink-3">
              ยังไม่มีใบเสนอราคาที่ผูกได้ — ต้องเป็นใบที่ยังไม่ถูกยกเลิก และยังไม่มีใบวางบิลอื่น
            </p>
          ) : (
            <>
              <label className="block text-sm">
                <span className="text-xs font-medium text-ink-3">ใบเสนอราคาที่จะผูก *</span>
                <select
                  value={qid} onChange={(e) => setQid(e.target.value ? Number(e.target.value) : "")}
                  className="w-full glass-soft rounded-lg px-3 py-2.5 mt-1 outline-none bg-white"
                >
                  <option value="">— เลือกใบเสนอราคา —</option>
                  {quotations.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.code} · {q.customer_snapshot?.name ?? "-"}
                      {q.customer_snapshot?.job ? ` · ${q.customer_snapshot.job}` : ""} · ฿{baht(q.net)}
                      {q.job_id ? "" : " [ยังไม่ผูกงาน]"}
                    </option>
                  ))}
                </select>
              </label>

              {selected && !selected.job_id && (
                <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  ⚠ ใบเสนอนี้ยังไม่ผูกงาน — ผูกได้ แต่เงินจะยังไม่ขึ้นบัญชี/ค้างรับ ให้ไปผูกงานที่ใบเสนอก่อนจะดีกว่า
                </p>
              )}
              {mismatch && (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  ⚠ ยอดไม่ตรงกัน — บิล ฿{baht(billTotal)} · ใบเสนอ ฿{baht(selected!.net)} ·
                  ระบบจะ<b>ไม่แก้ยอดบิล</b> (ส่งลูกค้าไปแล้ว) ผูกได้แต่ตรวจสอบเอง
                </p>
              )}

              <label className="flex items-center gap-2 text-sm text-ink-2">
                <input type="checkbox" checked={syncCustomer} onChange={(e) => setSyncCustomer(e.target.checked)} />
                ทับชื่อ/ที่อยู่บนบิลด้วยข้อมูลจากใบเสนอ
                <span className="text-xs text-ink-3">(ไม่ติ๊ก = คงหัวบิลเดิมที่พิมพ์ส่งลูกค้าไปแล้ว)</span>
              </label>

              {err && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
              <button
                type="button" onClick={submit} disabled={busy || !qid}
                className="press bg-brand text-white rounded-xl px-4 py-2.5 text-sm font-semibold shadow-brand disabled:opacity-50"
              >
                {busy ? "กำลังผูก…" : "ยืนยันผูกเข้าระบบ"}
              </button>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
