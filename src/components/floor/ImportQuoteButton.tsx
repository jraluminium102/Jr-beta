"use client";

import { useRef, useState } from "react";
import { baht } from "@/lib/money";
import Icon from "@/components/Icon";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Parsed = any;

/**
 * อัปโหลดใบเสนอราคา .xlsx ที่ผู้รับเหมาทำมา → จัดเข้าฟอร์มของเรา
 *
 * ทำไมต้องมีจอตรวจก่อน: ช่างเป็นผู้ใหญ่ ไฟล์มักมีปัญหา — สะกดผิด ตารางเลื่อน ชีทเกิน
 * ใบเบิกงวดปนมา ยอดพิมพ์ทับสูตร · ระบบ**เดาให้แต่ไม่ตัดสินใจแทน** โชว์ทุกอย่างที่แก้/ที่สงสัย
 */
export default function ImportQuoteButton({ onImport }: { onImport: (p: Parsed, applySuggest: string[]) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const upload = async (f: File) => {
    setErr(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch("/api/floor-quotations/import", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "อ่านไฟล์ไม่สำเร็จ");
      setParsed(json.data);
      // ติ๊กเฉพาะคำที่มั่นใจไว้ให้ก่อน (กลุ่ม "เสนอ" ต้องกดเอง)
      setPicked(new Set(json.data.changes.filter((c: Parsed) => c.sure).map((c: Parsed) => `${c.from}→${c.to}`)));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "อ่านไฟล์ไม่สำเร็จ");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const toggle = (k: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(k)) n.delete(k); else n.add(k);
      return n;
    });

  const confirm = () => {
    if (!parsed) return;
    const suggestKeys = parsed.changes
      .filter((c: Parsed) => !c.sure && picked.has(`${c.from}→${c.to}`))
      .map((c: Parsed) => c.from);
    onImport(parsed, suggestKeys);
    setParsed(null);
  };

  return (
    <>
      <input ref={fileRef} type="file" accept=".xlsx" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
      <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}
        className="press rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-50">
        <Icon name="file" size={16} /> {busy ? "กำลังอ่านไฟล์…" : "อัปโหลดใบของผู้รับเหมา (.xlsx)"}
      </button>

      {err && (
        <div className="mt-2 rounded-xl border border-red-300 bg-red-50 px-4 py-2.5 text-sm text-red-800">{err}</div>
      )}

      {parsed && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl my-6">
            <div className="px-5 py-4 border-b flex items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-ink">ตรวจก่อนนำเข้า</h3>
                <p className="text-xs text-ink-3">{parsed.fileName} · ชีต “{parsed.sheetName}”</p>
              </div>
              <button type="button" onClick={() => setParsed(null)} className="press text-ink-3 px-2 text-xl">✕</button>
            </div>

            <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* สรุป */}
              <div className="grid sm:grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-gray-50 border py-2">
                  <div className="text-xs text-ink-3">รายการ</div>
                  <div className="font-bold text-lg tabular-nums">{parsed.items.length}</div>
                </div>
                <div className="rounded-lg bg-gray-50 border py-2">
                  <div className="text-xs text-ink-3">ยอดในไฟล์</div>
                  <div className="font-bold text-lg tabular-nums">{parsed.statedTotal ? baht(parsed.statedTotal) : "—"}</div>
                </div>
                <div className={`rounded-lg border py-2 ${parsed.statedTotal && Math.abs(parsed.statedTotal - parsed.computedTotal) > 0.5 ? "bg-amber-50 border-amber-300" : "bg-emerald-50 border-emerald-300"}`}>
                  <div className="text-xs text-ink-3">ผลบวกรายการ</div>
                  <div className="font-bold text-lg tabular-nums">{baht(parsed.computedTotal)}</div>
                </div>
              </div>

              {/* ลูกค้า */}
              <div className="rounded-xl border p-3 text-sm">
                <div className="text-xs text-ink-3 mb-1">ข้อมูลที่อ่านได้จากหัวเอกสาร</div>
                <div><b>{parsed.customer.name || "(ไม่พบชื่อ)"}</b></div>
                {parsed.customer.address && <div className="text-ink-2">{parsed.customer.address}</div>}
                <div className="text-ink-3 text-xs mt-0.5">
                  วันที่ในไฟล์ {parsed.issueDateRaw || "—"} {parsed.customer.phone ? `· โทร ${parsed.customer.phone}` : ""}
                </div>
              </div>

              {/* คำที่แก้ */}
              {parsed.changes.length > 0 && (
                <div>
                  <h4 className="font-semibold text-sm mb-1.5">
                    คำที่จะแก้ <span className="font-normal text-ink-3">({parsed.changes.length} รายการ · ติ๊กออกได้ถ้าไม่ต้องการ)</span>
                  </h4>
                  <div className="rounded-xl border divide-y">
                    {parsed.changes.map((c: Parsed) => {
                      const k = `${c.from}→${c.to}`;
                      return (
                        <label key={k} className="flex items-start gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50">
                          <input type="checkbox" checked={picked.has(k)} onChange={() => toggle(k)} className="mt-1" />
                          <span className="flex-1">
                            <span className="line-through text-ink-3">{c.from}</span>
                            <span className="mx-1.5">→</span>
                            <b>{c.to}</b>
                            <span className="block text-xs text-ink-3">{c.why}</span>
                          </span>
                          {!c.sure && (
                            <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 rounded-full px-2 py-0.5 whitespace-nowrap">
                              ไม่แน่ใจ
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* คำเตือน */}
              {parsed.warnings.length > 0 && (
                <div>
                  <h4 className="font-semibold text-sm mb-1.5">สิ่งที่ควรดู</h4>
                  <ul className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 space-y-1 list-disc list-inside">
                    {parsed.warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}

              {/* ใบเบิกงวดที่ปนมา */}
              {parsed.installmentText?.length > 0 && (
                <details className="rounded-xl border p-3">
                  <summary className="text-sm font-semibold cursor-pointer">
                    ใบเบิกงวดที่ปนมาในไฟล์ ({parsed.installmentText.length} บรรทัด)
                  </summary>
                  <pre className="mt-2 text-xs text-ink-2 whitespace-pre-wrap font-sans">
                    {parsed.installmentText.join("\n")}
                  </pre>
                  <p className="text-xs text-ink-3 mt-2">
                    ไม่ได้นำเข้าอัตโนมัติ — สร้างงวดเองในหน้า “ใบเบิกงวด” หลังบันทึกใบเสนอ
                  </p>
                </details>
              )}

              {/* ตัวอย่างรายการ */}
              <details className="rounded-xl border p-3" open>
                <summary className="text-sm font-semibold cursor-pointer">รายการที่จะนำเข้า ({parsed.items.length})</summary>
                <div className="overflow-x-auto mt-2">
                  <table className="w-full text-xs">
                    <tbody>
                      {parsed.items.map((it: Parsed, i: number) => (
                        <tr key={i} className="border-t">
                          <td className="py-1 pr-2 text-ink-3 whitespace-nowrap align-top">{it.group_label || "—"}</td>
                          <td className="py-1 pr-2">{it.name}</td>
                          <td className="py-1 pr-2 text-right tabular-nums whitespace-nowrap align-top">{it.qty} {it.unit}</td>
                          <td className="py-1 text-right tabular-nums whitespace-nowrap align-top">{baht(it.line_total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </div>

            <div className="px-5 py-4 border-t flex justify-end gap-2">
              <button type="button" onClick={() => setParsed(null)}
                className="press rounded-xl border border-gray-300 px-4 py-2.5 text-sm">ยกเลิก</button>
              <button type="button" onClick={confirm}
                className="press rounded-xl bg-brand text-white font-semibold px-6 py-2.5">
                นำเข้า {parsed.items.length} รายการ
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
