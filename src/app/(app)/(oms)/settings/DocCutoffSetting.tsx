"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

/**
 * วันตัดเอกสารทดสอบ (go-live cutover) — เอกสาร (ใบเสนอ/ใบวางบิล/ใบเสร็จ) ที่ออก "ก่อนวันตัด"
 * ถือเป็นเอกสารช่วงทดสอบ → ซ่อนจากลิสต์จริงโดยดีฟอลต์ (กดปุ่ม "แสดงเอกสารทดสอบ" ในแต่ละหน้าเพื่อดู)
 */
export default function DocCutoffSetting() {
  const [cutoff, setCutoff] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api.get<{ cutoff: string }>("/settings/doc-cutoff")
      .then((r) => setCutoff(r.data?.cutoff ?? ""))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  async function save(next: string) {
    setBusy(true); setMsg("");
    try {
      const r = await api.post<{ cutoff: string }>("/settings/doc-cutoff", { cutoff: next });
      setCutoff(r.data?.cutoff ?? "");
      setMsg(next ? "บันทึกวันตัดแล้ว ✓" : "ล้างวันตัดแล้ว — โชว์ทุกเอกสาร ✓");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally { setBusy(false); }
  }

  return (
    <div className="glass-card rounded-2xl p-4 max-w-xl">
      <div className="text-white font-semibold mb-1">วันตัดเอกสารทดสอบ (เริ่มใช้ระบบจริง)</div>
      <p className="text-[13px] mb-3" style={{ color: "var(--t-low)" }}>
        เอกสาร (ใบเสนอ · ใบวางบิล · ใบเสร็จ) ที่ออก <b>ก่อนวันนี้</b> = เอกสารช่วงทดสอบ จะถูกซ่อนจากลิสต์จริง
        (กด &quot;แสดงเอกสารทดสอบ&quot; ในแต่ละหน้าเพื่อดูย้อนได้) · เว้นว่าง = โชว์ทุกเอกสาร
      </p>
      {!loaded ? (
        <div className="text-[13px]" style={{ color: "var(--t-low)" }}>กำลังโหลด…</div>
      ) : (
        <div className="flex items-center gap-2 flex-wrap">
          <input type="date" value={cutoff} onChange={(e) => setCutoff(e.target.value)}
            className="rounded-lg px-3 py-2 text-sm outline-none"
            style={{ background: "rgba(255,255,255,.08)", border: "0.5px solid rgba(255,255,255,.16)", color: "#fff" }} />
          <button disabled={busy || !cutoff} onClick={() => save(cutoff)}
            className="px-3.5 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-50" style={{ background: "#2f6bd8" }}>
            บันทึกวันตัด
          </button>
          <button disabled={busy} onClick={() => save("")}
            className="px-3 py-2 rounded-xl text-sm bg-white/8 text-white/80 disabled:opacity-50">
            ล้าง (โชว์ทุกเอกสาร)
          </button>
          {msg && <span className="text-[12.5px]" style={{ color: "var(--t-mid)" }}>{msg}</span>}
        </div>
      )}
    </div>
  );
}
