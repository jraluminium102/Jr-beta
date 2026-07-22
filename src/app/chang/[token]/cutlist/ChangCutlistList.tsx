"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

/**
 * รายการใบตัดของช่าง (ลิงก์ช่าง) — สร้างใบเปล่าได้เลย ไม่ต้องมีงานลูกค้า
 * ใช้ /api/cutlists ตัวเดียวกับออฟฟิศ (api client แนบโทเคนให้เอง — src/lib/api.ts)
 */
type Row = { id: number; code: string | null; name: string; status: string; job_id: string | null; created_at: string };

export default function ChangCutlistList({ token }: { token: string }) {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["chang-cutlists"],
    queryFn: () => api.get<Row[]>("/cutlists"),
  });
  const rows = data?.data ?? [];
  const [busy, setBusy] = useState(false);
  const [errMsg, setErrMsg] = useState("");
  const [newName, setNewName] = useState("");

  async function createBlank() {
    const nm = newName.trim();
    if (!nm) { setErrMsg('ตั้งชื่อใบตัดก่อน เช่น "เบิกเส้นซ่อมหน้างาน"'); return; }
    setBusy(true); setErrMsg("");
    try {
      const r = await api.post<{ id: number }>("/cutlists", { name: nm });
      qc.invalidateQueries({ queryKey: ["chang-cutlists"] });
      window.location.href = `/chang/${token}/cutlist/${r.data.id}`;
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "สร้างใบตัดไม่สำเร็จ");
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex gap-2 mb-4">
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="ชื่อใบตัด เช่น เบิกเส้นซ่อมหน้างาน"
          onKeyDown={(e) => { if (e.key === "Enter") createBlank(); }}
          className="flex-1 min-w-0 rounded-[12px] px-3 text-[15px] min-h-[52px] bg-white outline-none" style={{ border: "1px solid #d1d1d6", color: "#1c1c1e" }} />
        <button onClick={createBlank} disabled={busy || !newName.trim()}
          className="shrink-0 rounded-[12px] px-5 text-[15px] font-semibold text-white min-h-[52px] disabled:opacity-50"
          style={{ background: "#007aff" }}>
          + สร้าง
        </button>
      </div>
      {errMsg && (
        <div role="alert" className="text-[12.5px] rounded-xl px-3 py-2 mb-3" style={{ background: "#ffe5e5", color: "#c0392b" }}>{errMsg}</div>
      )}

      {isLoading ? <p className="text-center py-10" style={{ color: "#636366" }}>กำลังโหลด…</p>
        : error ? <p className="text-center py-10" style={{ color: "#ff3b30" }}>{error instanceof Error ? error.message : "โหลดไม่สำเร็จ"}</p>
          : rows.length === 0 ? <p className="text-center py-10 text-[13px]" style={{ color: "#a1a1a8" }}>ยังไม่มีใบตัด — กดปุ่มด้านบนเพื่อเริ่ม</p>
            : (
              <div className="space-y-2">
                {rows.map((r) => (
                  <a key={r.id} href={`/chang/${token}/cutlist/${r.id}`}
                    className="flex items-center justify-between gap-2 rounded-[14px] px-4 py-3 bg-white"
                    style={{ boxShadow: "0 1px 3px rgba(0,0,0,.06)" }}>
                    <span className="min-w-0">
                      <span className="font-bold text-[15px] tnum" style={{ color: "#007aff" }}>{r.code || `CL-${r.id}`}</span>
                      <span className="block text-[13px] truncate" style={{ color: "#1c1c1e" }}>{r.name || "—"}</span>
                      {!r.job_id && <span className="text-[11px]" style={{ color: "#a1a1a8" }}>ไม่ผูกงานลูกค้า</span>}
                    </span>
                    <span className="text-[11px] shrink-0 rounded-full px-2 py-0.5"
                      style={r.status === "stock_cut"
                        ? { background: "#e8f8ee", color: "#1a7d4f" }
                        : { background: "#f1f1f4", color: "#636366" }}>
                      {r.status === "stock_cut" ? "ตัดสต็อกแล้ว" : "ร่าง"}
                    </span>
                  </a>
                ))}
              </div>
            )}
    </>
  );
}
