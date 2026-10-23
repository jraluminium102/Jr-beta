"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { reasonLabel } from "@/lib/alu-pick/groups";
import { fmtQty, fmtWhen, type Pick, type PickItem } from "./types";

/**
 * รายการใบเบิกอลู — ใช้ทั้ง "ของที่ฉันเบิก" (ลิงก์ช่าง) และ "สโตร์อลู" (ออฟฟิศ)
 *   ปุ่มต่อใบ: คืน / แก้จำนวน / ยกเลิกทั้งใบ (ช่าง: เฉพาะใบที่ยังไม่ถูกตรวจ) · ตรวจแล้ว (สโตร์เท่านั้น)
 */
const C = { bg: "#f2f2f7", card: "#ffffff", ink: "#1c1c1e", ink2: "#636366", ink3: "#a1a1a8", blue: "#007aff", red: "#ff3b30", green: "#34c759", orange: "#ff9500", line: "#e5e5ea" };

export default function PickList({ picks, isChang, canCheck, onChanged, emptyText }: {
  picks: Pick[]; isChang: boolean; canCheck: boolean; onChanged: () => void; emptyText?: string;
}) {
  if (!picks.length) return <p className="text-center py-10 text-[14px]" style={{ color: C.ink3 }}>{emptyText ?? "ยังไม่มีใบเบิก"}</p>;
  return (
    <div className="space-y-3">
      {picks.map((p) => <PickCard key={p.id} p={p} isChang={isChang} canCheck={canCheck} onChanged={onChanged} />)}
    </div>
  );
}

function PickCard({ p, isChang, canCheck, onChanged }: { p: Pick; isChang: boolean; canCheck: boolean; onChanged: () => void }) {
  const [mode, setMode] = useState<"" | "return" | "edit" | "cancel">("");
  const [vals, setVals] = useState<Record<number, string>>({});
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const editable = p.status !== "cancelled" && (!isChang || p.status !== "checked");
  const who = p.customer_name ? `${p.customer_name}${p.job_code ? " · " + p.job_code : ""}` : reasonLabel(p.reason, p.reason_note) || "ไม่ระบุงาน";
  const totalLeft = p.items.reduce((s, it) => s + (it.qty - it.returned), 0);

  function open(m: typeof mode) {
    setErr(""); setVals({}); setReason("");
    setMode(mode === m ? "" : m);
  }
  async function run(fn: () => Promise<unknown>, okMsg?: string) {
    setBusy(true); setErr("");
    try { await fn(); setMode(""); onChanged(); if (okMsg) setErr(""); }
    // พลาด (เช่น สโตร์ตรวจไปแล้ว / คนอื่นแก้ก่อน) → โหลดใบใหม่ด้วย ให้ป้ายสถานะบนการ์ดตรงกับเหตุผลที่ขึ้น
    catch (e) { setErr(e instanceof Error ? e.message : "ไม่สำเร็จ"); onChanged(); }
    finally { setBusy(false); }
  }
  const submitReturn = () => run(async () => {
    if (p.items.some((it) => vals[it.id] && !Number.isFinite(Number(vals[it.id])))) throw new Error("จำนวนที่คืนต้องเป็นตัวเลข");
    const items = p.items.map((it) => ({ item_id: it.id, qty: Number(vals[it.id]) || 0 })).filter((x) => x.qty > 0);
    if (!items.length) throw new Error("ใส่จำนวนที่คืนอย่างน้อย 1 รายการ");
    await api.post(`/alu-picks/${p.id}/return`, { items });
  });
  const submitEdit = () => run(async () => {
    const items = p.items.map((it) => ({ item_id: it.id, qty: vals[it.id] === undefined || vals[it.id].trim() === "" ? it.qty : Number(vals[it.id]) }))
      .filter((x, i) => x.qty !== p.items[i].qty);
    if (!items.length) throw new Error("ยังไม่ได้เปลี่ยนตัวเลข");
    if (items.some((x) => !Number.isFinite(x.qty) || x.qty < 0)) throw new Error("จำนวนใหม่ต้องเป็นตัวเลข 0 ขึ้นไป");
    await api.patch(`/alu-picks/${p.id}`, { items });
  });
  const submitCancel = () => run(async () => { await api.del(`/alu-picks/${p.id}${reason ? `?reason=${encodeURIComponent(reason)}` : ""}`); });
  const toggleCheck = () => run(async () => { await api.post(`/alu-picks/${p.id}/check`, { checked: p.status !== "checked" }); });

  return (
    <div className="rounded-[16px] p-3.5" style={{ background: C.card, opacity: p.status === "cancelled" ? 0.6 : 1 }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[16px] font-bold leading-tight" style={{ color: C.ink }}>{who}</div>
          <div className="text-[12.5px] mt-0.5" style={{ color: C.ink2 }}>
            {fmtWhen(p.created_at)} · {p.picker_name || "ไม่ระบุชื่อ"} · {p.code}
          </div>
        </div>
        <StatusChip p={p} />
      </div>

      <div className="mt-2.5 divide-y" style={{ borderColor: C.line }}>
        {p.items.map((it) => (
          <ItemLine key={it.id} it={it} mode={mode} val={vals[it.id] ?? ""} onVal={(v) => setVals({ ...vals, [it.id]: v })} />
        ))}
      </div>
      {p.note && <div className="text-[12.5px] mt-2" style={{ color: C.ink2 }}>📝 {p.note}</div>}
      {p.status === "cancelled" && <div className="text-[12.5px] mt-2" style={{ color: C.red }}>ยกเลิกแล้ว{p.cancel_reason ? ` — ${p.cancel_reason}` : ""}{p.cancelled_at ? ` · ${fmtWhen(p.cancelled_at)}` : ""}</div>}
      {p.status === "checked" && <div className="text-[12.5px] mt-2" style={{ color: C.green }}>✓ สโตร์ตรวจแล้ว{p.checked_by_name ? ` โดย ${p.checked_by_name}` : ""}{p.checked_at ? ` · ${fmtWhen(p.checked_at)}` : ""}</div>}

      {mode === "cancel" && (
        <div className="mt-3 rounded-[12px] p-3" style={{ background: "#fff4f4" }}>
          <div className="text-[14px] font-semibold mb-2" style={{ color: C.red }}>ยกเลิกทั้งใบ — คืนเส้นที่เหลือทั้งหมด {fmtQty(totalLeft)} เส้นเข้าสต็อก</div>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เหตุผล (ไม่บังคับ) เช่น กดผิดใบ"
            className="w-full rounded-[10px] px-3 min-h-[44px] text-[15px] bg-white outline-none" style={{ border: `1px solid ${C.line}`, color: C.ink }} />
        </div>
      )}
      {err && <div role="alert" className="text-[13px] rounded-[10px] px-3 py-2 mt-2" style={{ background: "#ffe5e5", color: "#c0392b" }}>{err}</div>}

      {(editable || canCheck) && (
        <div className="flex flex-wrap gap-2 mt-3">
          {mode ? (
            <>
              <button disabled={busy} onClick={mode === "return" ? submitReturn : mode === "edit" ? submitEdit : submitCancel}
                className="min-h-[44px] rounded-[12px] px-4 text-[15px] font-semibold text-white disabled:opacity-50"
                style={{ background: mode === "cancel" ? C.red : C.blue }}>
                {busy ? "กำลังบันทึก…" : mode === "return" ? "ยืนยันคืน" : mode === "edit" ? "บันทึกจำนวนใหม่" : "ยืนยันยกเลิกใบนี้"}
              </button>
              <button disabled={busy} onClick={() => open("")} className="min-h-[44px] rounded-[12px] px-4 text-[15px]" style={{ background: C.bg, color: C.ink2 }}>ไม่ทำ</button>
            </>
          ) : (
            <>
              {editable && totalLeft > 0 && <button onClick={() => open("return")} className="min-h-[44px] rounded-[12px] px-4 text-[15px] font-semibold" style={{ background: "#e8f4ff", color: C.blue }}>↩️ คืนเส้น</button>}
              {editable && <button onClick={() => open("edit")} className="min-h-[44px] rounded-[12px] px-4 text-[15px] font-semibold" style={{ background: C.bg, color: C.ink }}>✏️ แก้จำนวน</button>}
              {editable && <button onClick={() => open("cancel")} className="min-h-[44px] rounded-[12px] px-4 text-[15px] font-semibold" style={{ background: "#fff0f0", color: C.red }}>ยกเลิกทั้งใบ</button>}
              {canCheck && p.status !== "cancelled" && (
                <button disabled={busy} onClick={toggleCheck} className="min-h-[44px] rounded-[12px] px-4 text-[15px] font-semibold ml-auto text-white disabled:opacity-50"
                  style={{ background: p.status === "checked" ? C.ink3 : C.green }}>
                  {p.status === "checked" ? "ยกเลิกการตรวจ" : "✓ ตรวจแล้ว"}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function StatusChip({ p }: { p: Pick }) {
  const s = p.status === "cancelled" ? { t: "ยกเลิก", bg: "#f2f2f7", c: C.ink2 }
    : p.status === "checked" ? { t: "ตรวจแล้ว", bg: "#e6f9ea", c: "#1f8a3b" }
      : { t: "รอสโตร์ตรวจ", bg: "#fff3e0", c: "#b26a00" };
  return <span className="shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold" style={{ background: s.bg, color: s.c }}>{s.t}</span>;
}

function ItemLine({ it, mode, val, onVal }: { it: PickItem; mode: string; val: string; onVal: (v: string) => void }) {
  const left = it.qty - it.returned;
  return (
    <div className="flex items-center gap-2.5 py-2">
      <Thumb url={it.image_url} />
      <div className="min-w-0 flex-1">
        <div className="text-[14.5px] font-semibold leading-tight truncate" style={{ color: C.ink }}>{it.name}</div>
        <div className="text-[12px]" style={{ color: C.ink2 }}>{it.sku}{it.color && !it.name.includes(it.color) ? ` · ${it.color}` : ""}</div>
      </div>
      {mode === "return" ? (
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[12px]" style={{ color: C.ink2 }}>คืน</span>
          <input inputMode="decimal" value={val} onChange={(e) => onVal(e.target.value)} placeholder="0"
            className="w-[64px] min-h-[44px] rounded-[10px] text-center text-[16px] font-bold outline-none bg-white" style={{ border: `1px solid ${C.blue}`, color: C.ink }} />
          <span className="text-[12px]" style={{ color: C.ink3 }}>/ {fmtQty(left)}</span>
        </div>
      ) : mode === "edit" ? (
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[12px]" style={{ color: C.ink2 }}>{fmtQty(it.qty)} →</span>
          <input inputMode="decimal" value={val} onChange={(e) => onVal(e.target.value)} placeholder={fmtQty(it.qty)}
            className="w-[64px] min-h-[44px] rounded-[10px] text-center text-[16px] font-bold outline-none bg-white" style={{ border: `1px solid ${C.blue}`, color: C.ink }} />
        </div>
      ) : (
        <div className="text-right shrink-0">
          <div className="text-[17px] font-bold tabular-nums" style={{ color: C.ink }}>{fmtQty(left)} <span className="text-[12px] font-normal" style={{ color: C.ink2 }}>{it.unit}</span></div>
          {it.returned > 0 && <div className="text-[11.5px]" style={{ color: C.orange }}>เบิก {fmtQty(it.qty)} คืน {fmtQty(it.returned)}</div>}
        </div>
      )}
    </div>
  );
}

export function Thumb({ url, size = 44 }: { url: string; size?: number }) {
  return url
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={url} alt="" width={size} height={size} className="rounded-[8px] object-cover shrink-0 bg-white" style={{ width: size, height: size, border: `1px solid ${C.line}` }} />
    : <div className="rounded-[8px] shrink-0 flex items-center justify-center text-[11px]" style={{ width: size, height: size, background: C.bg, color: C.ink3 }}>ไม่มีรูป</div>;
}
