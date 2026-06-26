"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChangChecklist, DAY_COLOR, dayColorOf, thHead, IOS, type ProdSet,
} from "@/app/(app)/(oms)/production-schedule/page";

type Row = {
  id: string; job_id: string | null; title: string; job_code: string | null;
  customer_area: string | null; produce_date: string | null; due_date: string | null; install_date: string | null;
  status: string; sets: ProdSet[];
};
const today = () => new Date().toISOString().slice(0, 10);
const thShort = (d: string | null) => {
  if (!d) return "—"; const [y, m, day] = d.split("-"); return `${day}/${m}/${y}`;
};

export default function ChangPublicView({ token }: { token: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [name, setName] = useState("");
  const [savingSetIds, setSavingSetIds] = useState<Set<number>>(new Set());
  const [lastSync, setLastSync] = useState("");

  useEffect(() => { try { setName(localStorage.getItem("chang_name") || ""); } catch { /* ignore */ } }, []);
  const saveName = (v: string) => { setName(v); try { localStorage.setItem("chang_name", v); } catch { /* ignore */ } };

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/chang/${token}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "โหลดไม่สำเร็จ");
      setRows(j.data || []); setErr("");
      setLastSync(new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }));
    } catch (e) { setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"); }
    finally { setLoading(false); }
  }, [token]);
  useEffect(() => { load(); }, [load]);

  // อัปเดตอัตโนมัติ: เมื่อกลับมาที่แท็บ/โฟกัส + ทุก 30 วินาที (ลิงก์ช่างจะไม่ค้างข้อมูลเก่า)
  useEffect(() => {
    const onActive = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onActive);
    window.addEventListener("focus", onActive);
    const iv = setInterval(load, 30000);
    return () => {
      document.removeEventListener("visibilitychange", onActive);
      window.removeEventListener("focus", onActive);
      clearInterval(iv);
    };
  }, [load]);

  const mark = useCallback(async (setId: number, patch: Record<string, string | null>, confirmMsg?: string) => {
    if (confirmMsg && !confirm(confirmMsg)) return;
    const field = Object.keys(patch)[0]; const value = patch[field] ?? "";
    setSavingSetIds((p) => new Set(p).add(setId));
    try {
      const r = await fetch(`/api/chang/${token}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ set_id: setId, field, value, by: name || undefined }),
      });
      if (!r.ok) throw new Error();
      await load();
    } catch { alert("บันทึกไม่สำเร็จ — เช็คเน็ตแล้วลองอีกครั้ง"); }
    finally { setSavingSetIds((p) => { const n = new Set(p); n.delete(setId); return n; }); }
  }, [token, name, load]);

  const groups = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of rows) { const k = r.due_date ?? "zzz"; if (!m.has(k)) m.set(k, []); m.get(k)!.push(r); }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

  return (
    <div style={{ background: IOS.page, minHeight: "100vh", color: IOS.ink }} className="p-4 sm:p-6">
      <div className="max-w-[760px] mx-auto">
        <div className="flex items-center gap-2 mb-0.5">
          <h1 className="text-2xl font-bold" style={{ letterSpacing: "-.01em" }}>📋 ตารางผลิต — ช่าง</h1>
          <button onClick={() => load()} aria-label="รีเฟรช"
            className="ml-auto inline-flex items-center gap-1 rounded-[10px] px-3 py-1.5 text-[13px] font-semibold min-h-[36px] text-white" style={{ background: IOS.blue }}>
            ↻ รีเฟรช
          </button>
        </div>
        <p className="text-[12.5px] mb-3" style={{ color: IOS.ink2 }}>
          แตะปุ่มเพื่ออัปเดตงาน · อัปเดตอัตโนมัติทุก 30 วิ{lastSync ? ` · ล่าสุด ${lastSync}` : ""}
        </p>

        <div className="mb-4 flex items-center gap-2">
          <span className="text-[13px]" style={{ color: IOS.ink2 }}>ฉันคือ:</span>
          <input value={name} onChange={(e) => saveName(e.target.value)} placeholder="ใส่ชื่อช่าง (ไว้บันทึกว่าใครกด)"
            className="flex-1 max-w-[260px] rounded-[10px] px-3 py-1.5 text-[14px] outline-none border bg-white"
            style={{ borderColor: IOS.line, color: IOS.ink }} />
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-5 text-[11px]">
          {["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"].map((d, i) => (
            <span key={i} className="inline-flex items-center gap-1.5 font-medium" style={{ color: DAY_COLOR[i].deep }}>
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: DAY_COLOR[i].dot }} />{d}
            </span>
          ))}
        </div>

        {loading ? <p className="text-center py-12" style={{ color: IOS.ink2 }}>กำลังโหลด…</p>
          : err ? <p className="text-center py-12 text-red-600">{err}</p>
            : groups.length === 0 ? <p className="text-center py-12" style={{ color: IOS.ink2 }}>ยังไม่มีงานในตารางผลิต</p>
              : (
                <div className="space-y-5">
                  {groups.map(([dateKey, items]) => {
                    const dc = dayColorOf(dateKey); const isToday = dateKey === today();
                    return (
                      <div key={dateKey}>
                        <div className="flex items-center gap-2 mb-2 px-1">
                          {dc && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: dc.dot }} />}
                          <span className="text-[11px] font-semibold" style={{ color: IOS.ink3 }}>กำหนดเสร็จ</span>
                          <span className="text-[15px] font-bold" style={{ color: dc ? dc.deep : IOS.ink }}>{thHead(dateKey === "zzz" ? null : dateKey)}</span>
                          {isToday && <span className="text-[10px] rounded-full px-2 py-0.5 font-bold text-white" style={{ background: IOS.green }}>วันนี้</span>}
                          <span className="ml-auto text-[12px] font-medium" style={{ color: IOS.ink3 }}>{items.length} งาน</span>
                        </div>
                        <div className="space-y-2.5">
                          {items.map((r) => (
                            <div key={r.id} className="rounded-[18px] p-4 space-y-3" style={{ background: IOS.card, boxShadow: "0 1px 3px rgba(0,0,0,.06), 0 6px 16px rgba(0,0,0,.04)" }}>
                              <div>
                                <div className="font-bold text-[16px]" style={{ color: IOS.ink, letterSpacing: "-.01em" }}>
                                  {r.title}{r.job_code && <span className="ml-1.5 text-[10px] tnum rounded-md px-1.5 py-0.5 font-semibold align-middle" style={{ background: "#eaf3ff", color: IOS.blue }}>{r.job_code}</span>}
                                </div>
                                {r.customer_area && <div className="text-[12.5px] mt-0.5" style={{ color: IOS.ink2 }}>📍 {r.customer_area}</div>}
                                {r.install_date && <div className="text-[12px] mt-0.5" style={{ color: IOS.ink2 }}>🔧 ติดตั้ง {thShort(r.install_date)}</div>}
                              </div>
                              {r.sets.length > 0
                                ? <ChangChecklist sets={r.sets} savingSetIds={savingSetIds} mark={mark} canMark={true} />
                                : <p className="text-[12px] rounded-xl px-3 py-2" style={{ background: "#fff4e0", color: "#b45309" }}>⚠️ ยังไม่มีชุดงาน — รอออฟฟิศลงรายละเอียด</p>}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
        <p className="text-center text-[11px] mt-8" style={{ color: IOS.ink3 }}>JR Aluminium · หน้าสำหรับช่างผลิต</p>
      </div>
    </div>
  );
}
