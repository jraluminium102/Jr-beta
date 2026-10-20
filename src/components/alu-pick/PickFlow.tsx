"use client";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PICKER_NAMES, PICK_GROUPS, PICK_REASONS } from "@/lib/alu-pick/groups";
import PickList, { Thumb } from "./PickList";
import { fmtQty, type Pick, type PickJob, type PickableItem } from "./types";

/**
 * หน้าเบิกอลูของช่าง (มือถือ) — เจ้าของเคาะ 19 ต.ค.69
 *   3 จอ: เลือกงาน → เลือกเส้น (หมวด → สี → เส้น ใส่จำนวน) → บันทึก (ตัดสต็อกทันที)
 *   + แถบล่าง "ของที่ฉันเบิก" (คืน/แก้/ยกเลิก ได้เองจนกว่าสโตร์ตรวจ)
 *   กติกา: พิมพ์แค่ตัวเลขจำนวนเส้น ที่เหลือกดเลือก · ปุ่มใหญ่ ≥44px · ชื่อช่างจำไว้ในมือถือ (localStorage chang_name)
 *
 * ใช้ได้ทั้งบนลิงก์ช่าง (/chang/<token>/pick · api แนบโทเคนให้) และหน้าออฟฟิศ (สโตร์เบิกแทนช่าง)
 */
const C = { bg: "#f2f2f7", card: "#ffffff", ink: "#1c1c1e", ink2: "#636366", ink3: "#a1a1a8", blue: "#007aff", red: "#ff3b30", green: "#34c759", line: "#e5e5ea" };
const NAME_KEY = "chang_name";
const DRAFT_KEY = "alu_pick_draft_v1";

type Step = "job" | "items" | "review" | "done";
type Job = { job_id: string | null; title: string; job_code: string | null };
type Draft = { job: Job | null; reason: string; reasonNote: string; cart: Record<string, number>; note: string };
const EMPTY: Draft = { job: null, reason: "", reasonNote: "", cart: {}, note: "" };

export default function PickFlow({ isChang, fixedName }: { isChang: boolean; fixedName?: string }) {
  const qc = useQueryClient();
  const [name, setName] = useState(fixedName ?? "");
  const [askName, setAskName] = useState(false);
  const [tab, setTab] = useState<"new" | "mine">("new");
  const [step, setStep] = useState<Step>("job");
  const [d, setD] = useState<Draft>(EMPTY);
  const [group, setGroup] = useState<string>("");
  const [color, setColor] = useState<string>("");
  const [q, setQ] = useState("");          // ค้นเส้น
  const [jobQ, setJobQ] = useState("");    // ค้นงาน (แยกกัน กดย้อนแล้วคำค้นไม่ปนกัน)
  const [limit, setLimit] = useState(60);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<{ code: string; id: number } | null>(null);

  // ชื่อช่าง + ร่างที่ค้าง (เผื่อหน้าโหลดใหม่กลางทาง)
  useEffect(() => {
    if (fixedName) return;
    try {
      // ออฟฟิศเบิกแทนช่าง = เลือกชื่อช่างใหม่ทุกใบ (ไม่จำ) · มือถือช่าง = จำชื่อไว้
      const n = isChang ? (localStorage.getItem(NAME_KEY) || "") : "";
      setName(n); if (!n) setAskName(true);
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) { const dd = JSON.parse(raw) as Draft; if (dd && Object.keys(dd.cart ?? {}).length) { setD({ ...EMPTY, ...dd }); setStep(dd.job || dd.reason ? "items" : "job"); } }
    } catch { /* ignore */ }
  }, [fixedName, isChang]);
  useEffect(() => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* ignore */ } }, [d]);
  const saveName = (v: string) => { setName(v); setAskName(false); if (isChang) { try { localStorage.setItem(NAME_KEY, v); } catch { /* ignore */ } } };

  const itemsQ = useQuery({ queryKey: ["alu-pick-items"], queryFn: () => api.get<{ items: PickableItem[] }>("/alu-picks/items"), staleTime: 5 * 60 * 1000 });
  const jobsQ = useQuery({ queryKey: ["alu-pick-jobs"], queryFn: () => api.get<PickJob[]>("/alu-picks/jobs"), staleTime: 60 * 1000 });
  const mineQ = useQuery({ queryKey: ["alu-picks-mine", name], queryFn: () => api.get<Pick[]>("/alu-picks?mine=1&days=60"), enabled: !!name });
  const items = itemsQ.data?.data.items ?? [];
  const jobs = jobsQ.data?.data ?? [];
  const mine = mineQ.data?.data ?? [];
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  // "ที่ฉันเบิกบ่อย" = เส้นที่ช่างคนนี้เบิกบ่อยสุด 60 วัน (สูงสุด 12)
  const frequent = useMemo(() => {
    const cnt = new Map<number, number>();
    for (const p of mine) if (p.status !== "cancelled") for (const it of p.items) cnt.set(it.stock_item_id, (cnt.get(it.stock_item_id) ?? 0) + 1);
    return [...cnt].sort((a, b) => b[1] - a[1]).map(([id]) => byId.get(id)).filter((x): x is PickableItem => !!x).slice(0, 12);
  }, [mine, byId]);

  const inGroup = useMemo(() => (group === "fav" ? frequent : group ? items.filter((i) => i.group === group) : []), [group, items, frequent]);
  const colors = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of inGroup) m.set(i.color || "ไม่ระบุสี", (m.get(i.color || "ไม่ระบุสี") ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]);
  }, [inGroup]);
  const shown = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const base = qq ? items.filter((i) => `${i.sku} ${i.name} ${i.color}`.toLowerCase().includes(qq)) : inGroup;
    return (color && !qq ? base.filter((i) => (i.color || "ไม่ระบุสี") === color) : base);
  }, [q, items, inGroup, color]);

  const cartRows = useMemo(() => Object.entries(d.cart).map(([id, qty]) => ({ item: byId.get(Number(id)), id: Number(id), qty })).filter((r) => r.qty > 0), [d.cart, byId]);
  const totalBars = cartRows.reduce((s, r) => s + r.qty, 0);
  const setQty = (id: number, qty: number) => setD((x) => ({ ...x, cart: { ...x.cart, [id]: Math.max(0, Math.round(qty * 100) / 100) } }));

  const whoLabel = d.job ? d.job.title : d.reason === "repair" ? "งานซ่อม" : d.reason === "other" ? `อื่นๆ: ${d.reasonNote}` : "";

  async function save() {
    if (!name.trim()) { setAskName(true); return; }
    setBusy(true); setErr("");
    try {
      const r = await api.post<{ id: number; code: string }>("/alu-picks", {
        job_id: d.job?.job_id ?? null, reason: d.reason, reason_note: d.reasonNote, note: d.note, picker_name: name,
        items: cartRows.map((r) => ({ stock_item_id: r.id, qty: r.qty })),
      });
      setDone(r.data); setStep("done"); setD(EMPTY); setGroup(""); setColor(""); setQ("");
      qc.invalidateQueries({ queryKey: ["alu-pick-items"] });
      qc.invalidateQueries({ queryKey: ["alu-picks-mine"] });
    } catch (e) { setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setBusy(false); }
  }
  const restart = () => { setDone(null); setStep("job"); setD(EMPTY); setGroup(""); setColor(""); setQ(""); setErr(""); if (!isChang && !fixedName) { setName(""); setAskName(true); } };

  // ── จอเลือกชื่อ ──
  if (askName) {
    return (
      <Shell title={isChang ? "คุณคือใคร?" : "ช่างคนไหนหยิบของ?"} sub={isChang ? "กดชื่อตัวเอง มือถือจะจำไว้ ไม่ต้องกดอีก" : "เลือกชื่อช่างที่หยิบเส้นจริง (เลือกใหม่ทุกใบ)"}>
        <div className="grid grid-cols-2 gap-2.5">
          {PICKER_NAMES.map((n) => (
            <button key={n} onClick={() => saveName(n)} className="min-h-[60px] rounded-[14px] text-[18px] font-bold"
              style={{ background: n === name ? C.blue : C.card, color: n === name ? "#fff" : C.ink }}>{n}</button>
          ))}
        </div>
        <NameOther onPick={saveName} />
      </Shell>
    );
  }

  return (
    <div style={{ paddingBottom: "calc(96px + env(safe-area-inset-bottom))" }}>
      {/* หัว: ชื่อ + แท็บ */}
      <div className="flex items-center gap-2 px-4 pt-3">
        <button onClick={() => !fixedName && setAskName(true)} className="rounded-full px-3 min-h-[36px] text-[13px] font-semibold" style={{ background: C.card, color: C.ink }}>
          👤 {name || "เลือกชื่อ"}{!fixedName && <span style={{ color: C.blue }}> · เปลี่ยน</span>}
        </button>
        <div className="ml-auto flex rounded-full p-0.5" style={{ background: "#e5e5ea" }}>
          {(["new", "mine"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className="rounded-full px-3.5 min-h-[34px] text-[13.5px] font-semibold"
              style={{ background: tab === t ? C.card : "transparent", color: tab === t ? C.ink : C.ink2 }}>
              {t === "new" ? "เบิกใหม่" : `ของที่ฉันเบิก${mine.length ? ` (${mine.filter((p) => p.status === "open").length})` : ""}`}
            </button>
          ))}
        </div>
      </div>

      {tab === "mine" ? (
        <div className="px-4 pt-3">
          <p className="text-[12.5px] mb-2" style={{ color: C.ink2 }}>60 วันล่าสุด · แก้/คืน/ยกเลิกได้เองจนกว่าสโตร์กด "ตรวจแล้ว"</p>
          {mineQ.isLoading ? <p className="text-center py-10" style={{ color: C.ink2 }}>กำลังโหลด…</p>
            : <PickList picks={mine} isChang={isChang} canCheck={false} onChanged={() => { qc.invalidateQueries({ queryKey: ["alu-picks-mine"] }); qc.invalidateQueries({ queryKey: ["alu-pick-items"] }); }} emptyText="ยังไม่เคยเบิก" />}
        </div>
      ) : step === "done" && done ? (
        <Shell title="บันทึกแล้ว ✓" sub={`ใบเบิก ${done.code} ตัดสต็อกเรียบร้อย สโตร์จะเห็นทันที`}>
          <div className="grid gap-2.5">
            <button onClick={restart} className="min-h-[56px] rounded-[14px] text-[17px] font-bold text-white" style={{ background: C.blue }}>เบิกอีกใบ</button>
            <button onClick={() => { setTab("mine"); restart(); }} className="min-h-[56px] rounded-[14px] text-[17px] font-semibold" style={{ background: C.card, color: C.ink }}>ดู / แก้ ของที่ฉันเบิก</button>
          </div>
        </Shell>
      ) : step === "job" ? (
        <Shell title="เบิกไปงานไหน?" sub="กดชื่อลูกค้า — งานที่อยู่ในตารางผลิตขึ้นให้เลย">
          <input value={jobQ} onChange={(e) => setJobQ(e.target.value)} placeholder="ค้นชื่อลูกค้า (ไม่บังคับ)" inputMode="search"
            className="w-full rounded-[12px] px-3 min-h-[48px] text-[15px] bg-white outline-none mb-2.5" style={{ border: `1px solid ${C.line}`, color: C.ink }} />
          <div className="grid gap-2 mb-3">
            {jobsQ.isLoading && <p className="text-center py-6" style={{ color: C.ink2 }}>กำลังโหลดงาน…</p>}
            {jobs.filter((j) => !jobQ.trim() || `${j.title} ${j.job_code ?? ""}`.toLowerCase().includes(jobQ.trim().toLowerCase())).slice(0, 40).map((j) => (
              <button key={j.job_id} onClick={() => { setD({ ...d, job: { job_id: j.job_id, title: j.title, job_code: j.job_code }, reason: "", reasonNote: "" }); setStep("items"); }}
                className="min-h-[56px] rounded-[14px] px-4 text-left flex items-center justify-between gap-2" style={{ background: C.card }}>
                <span className="text-[16px] font-bold truncate" style={{ color: C.ink }}>{j.title}</span>
                <span className="text-[12px] shrink-0" style={{ color: C.ink2 }}>{j.job_code ?? ""}{j.due_date ? ` · เสร็จ ${j.due_date.slice(5).replace("-", "/")}` : ""}</span>
              </button>
            ))}
          </div>
          <div className="rounded-[14px] p-3" style={{ background: C.card }}>
            <div className="text-[14px] font-semibold mb-2" style={{ color: C.ink }}>ไม่มีชื่อลูกค้า</div>
            <div className="grid grid-cols-2 gap-2">
              {PICK_REASONS.map((r) => (
                <button key={r.key} onClick={() => setD({ ...d, job: null, reason: r.key, reasonNote: r.key === "other" ? d.reasonNote : "" })} className="min-h-[48px] rounded-[12px] text-[15px] font-semibold"
                  style={{ background: d.reason === r.key ? C.blue : C.bg, color: d.reason === r.key ? "#fff" : C.ink }}>{r.label}</button>
              ))}
            </div>
            {d.reason === "other" && (
              <input value={d.reasonNote} onChange={(e) => setD({ ...d, reasonNote: e.target.value })} placeholder="เบิกไปทำอะไร เช่น ทำตัวอย่างหน้าร้าน"
                className="w-full rounded-[12px] px-3 min-h-[48px] text-[15px] bg-white outline-none mt-2" style={{ border: `1px solid ${C.line}`, color: C.ink }} />
            )}
            {d.reason && (d.reason !== "other" || d.reasonNote.trim()) && (
              <button onClick={() => setStep("items")} className="w-full min-h-[48px] rounded-[12px] text-[15px] font-bold text-white mt-2" style={{ background: C.blue }}>ถัดไป → เลือกเส้น</button>
            )}
          </div>
        </Shell>
      ) : step === "items" ? (
        <Shell title={whoLabel} sub="กดหมวด → กดสี → กดเส้น แล้วใส่จำนวน" onBack={() => setStep("job")}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="หรือพิมพ์รหัส/ชื่อ เช่น B22" inputMode="search"
            className="w-full rounded-[12px] px-3 min-h-[48px] text-[15px] bg-white outline-none mb-2.5" style={{ border: `1px solid ${C.line}`, color: C.ink }} />
          {!q.trim() && (
            <>
              <div className="grid grid-cols-3 gap-2 mb-2.5">
                {frequent.length > 0 && <GroupBtn on={group === "fav"} label="⭐ เบิกบ่อย" onClick={() => { setGroup("fav"); setColor(""); setLimit(60); }} />}
                {PICK_GROUPS.map((g) => (
                  <GroupBtn key={g.key} on={group === g.key} label={g.short} sub={g.key.startsWith("door") ? "ประตู/หน้าต่าง" : undefined}
                    onClick={() => { setGroup(g.key); setColor(""); setLimit(60); }} />
                ))}
              </div>
              {group && colors.length > 1 && (
                <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1">
                  <Chip on={!color} label="ทุกสี" onClick={() => setColor("")} />
                  {colors.map(([c, n]) => <Chip key={c} on={color === c} label={`${c} (${n})`} onClick={() => setColor(c)} />)}
                </div>
              )}
            </>
          )}
          {itemsQ.isLoading ? <p className="text-center py-8" style={{ color: C.ink2 }}>กำลังโหลดรายการเส้น…</p>
            : !group && !q.trim() ? <p className="text-center py-8 text-[14px]" style={{ color: C.ink3 }}>กดหมวดด้านบนก่อน</p>
              : shown.length === 0 ? <p className="text-center py-8 text-[14px]" style={{ color: C.ink3 }}>ไม่พบเส้นในหมวด/สีนี้</p>
                : (
                  <div className="grid gap-1.5">
                    {shown.slice(0, limit).map((it) => <ItemRow key={it.id} it={it} qty={d.cart[it.id] ?? 0} onQty={(v) => setQty(it.id, v)} />)}
                    {shown.length > limit && <button onClick={() => setLimit(limit + 60)} className="min-h-[44px] rounded-[12px] text-[14px] font-semibold" style={{ background: C.card, color: C.blue }}>แสดงเพิ่ม ({shown.length - limit} รายการ)</button>}
                  </div>
                )}
        </Shell>
      ) : (
        <Shell title="ตรวจก่อนบันทึก" sub={whoLabel} onBack={() => setStep("items")}>
          <div className="rounded-[14px] p-2" style={{ background: C.card }}>
            {cartRows.map((r) => r.item && <ItemRow key={r.id} it={r.item} qty={r.qty} onQty={(v) => setQty(r.id, v)} />)}
          </div>
          <input value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} placeholder="หมายเหตุ (ไม่บังคับ)"
            className="w-full rounded-[12px] px-3 min-h-[48px] text-[15px] bg-white outline-none mt-2.5" style={{ border: `1px solid ${C.line}`, color: C.ink }} />
          {err && <div role="alert" className="text-[13.5px] rounded-[10px] px-3 py-2 mt-2" style={{ background: "#ffe5e5", color: "#c0392b" }}>{err}</div>}
        </Shell>
      )}

      {/* แถบล่าง */}
      {tab === "new" && (step === "items" || step === "review") && (
        <div className="fixed left-0 right-0 bottom-0 px-4 py-3 flex items-center gap-3" style={{ background: "rgba(242,242,247,.96)", borderTop: `1px solid ${C.line}`, backdropFilter: "blur(8px)", paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}>
          <div className="min-w-0">
            <div className="text-[15px] font-bold" style={{ color: C.ink }}>{cartRows.length} รายการ · {fmtQty(totalBars)} เส้น</div>
            {step === "items" && cartRows.length > 0 && <button onClick={() => setD({ ...d, cart: {} })} className="text-[12px]" style={{ color: C.red }}>ล้างทั้งหมด</button>}
          </div>
          {step === "items" ? (
            <button disabled={!cartRows.length} onClick={() => { setErr(""); setStep("review"); }} className="ml-auto min-h-[52px] rounded-[14px] px-6 text-[16px] font-bold text-white disabled:opacity-40" style={{ background: C.blue }}>ถัดไป →</button>
          ) : (
            <button disabled={busy || !cartRows.length} onClick={save} className="ml-auto min-h-[52px] rounded-[14px] px-6 text-[16px] font-bold text-white disabled:opacity-40" style={{ background: C.green }}>{busy ? "กำลังบันทึก…" : "✓ บันทึก ตัดสต็อก"}</button>
          )}
        </div>
      )}
    </div>
  );
}

function Shell({ title, sub, onBack, children }: { title: string; sub?: string; onBack?: () => void; children: React.ReactNode }) {
  return (
    <div className="px-4 pt-3">
      <div className="flex items-start gap-2 mb-2.5">
        {onBack && <button onClick={onBack} className="min-h-[40px] min-w-[40px] rounded-full text-[18px]" style={{ background: C.card, color: C.blue }}>‹</button>}
        <div className="min-w-0">
          <h1 className="text-[20px] font-bold leading-tight truncate" style={{ color: C.ink }}>{title}</h1>
          {sub && <p className="text-[12.5px]" style={{ color: C.ink2 }}>{sub}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}
function GroupBtn({ on, label, sub, onClick }: { on: boolean; label: string; sub?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="min-h-[56px] rounded-[14px] px-2 flex flex-col items-center justify-center leading-tight"
      style={{ background: on ? C.blue : C.card, color: on ? "#fff" : C.ink }}>
      {sub && <span className="text-[10.5px]" style={{ color: on ? "rgba(255,255,255,.8)" : C.ink2 }}>{sub}</span>}
      <span className="text-[15px] font-bold">{label}</span>
    </button>
  );
}
function Chip({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return <button onClick={onClick} className="shrink-0 rounded-full px-3.5 min-h-[38px] text-[13.5px] font-semibold" style={{ background: on ? C.ink : C.card, color: on ? "#fff" : C.ink }}>{label}</button>;
}
function ItemRow({ it, qty, onQty }: { it: PickableItem; qty: number; onQty: (v: number) => void }) {
  const on = qty > 0;
  return (
    <div className="flex items-center gap-2.5 rounded-[14px] px-2.5 py-2" style={{ background: C.card, outline: on ? `2px solid ${C.blue}` : "none" }} onClick={() => { if (!on) onQty(1); }}>
      <Thumb url={it.image_url} size={48} />
      <div className="min-w-0 flex-1">
        <div className="text-[14.5px] font-semibold leading-tight" style={{ color: C.ink }}>{it.name}</div>
        <div className="text-[12px]" style={{ color: C.ink2 }}>{it.sku}{it.color && !it.name.includes(it.color) ? ` · ${it.color}` : ""} · เหลือ <b style={{ color: it.qty <= 0 ? C.red : C.ink2 }}>{fmtQty(it.qty)}</b></div>
      </div>
      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
        <button onClick={() => onQty(qty - 1)} disabled={!on} className="min-h-[44px] min-w-[44px] rounded-[10px] text-[22px] font-bold disabled:opacity-30" style={{ background: C.bg, color: C.ink }}>−</button>
        <input inputMode="decimal" value={on ? fmtQty(qty) : ""} placeholder="0" onChange={(e) => onQty(Number(e.target.value) || 0)}
          className="w-[52px] min-h-[44px] rounded-[10px] text-center text-[17px] font-bold outline-none" style={{ background: on ? "#e8f4ff" : C.bg, color: C.ink }} />
        <button onClick={() => onQty(qty + 1)} className="min-h-[44px] min-w-[44px] rounded-[10px] text-[22px] font-bold text-white" style={{ background: C.blue }}>+</button>
      </div>
    </div>
  );
}
function NameOther({ onPick }: { onPick: (v: string) => void }) {
  const [v, setV] = useState("");
  return (
    <div className="flex gap-2 mt-3">
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder="ชื่ออื่น พิมพ์เอง" className="flex-1 min-w-0 rounded-[12px] px-3 min-h-[52px] text-[16px] bg-white outline-none" style={{ border: `1px solid ${C.line}`, color: C.ink }} />
      <button disabled={!v.trim()} onClick={() => onPick(v.trim())} className="min-h-[52px] rounded-[12px] px-4 text-[15px] font-semibold text-white disabled:opacity-40" style={{ background: C.blue }}>ใช้ชื่อนี้</button>
    </div>
  );
}
