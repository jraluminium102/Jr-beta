"use client";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PICKER_NAMES, PICK_TYPES, PICK_BRANDS, PICK_REASONS } from "@/lib/alu-pick/groups";
import PickList, { Thumb } from "./PickList";
import { fmtQty, fmtDay, shortFactory, type Pick, type PickJob, type PickableItem, type PickProfile } from "./types";

/**
 * หน้าเบิกอลูของช่าง (มือถือ) — เจ้าของเคาะ 19 ต.ค.69
 *   3 จอ: เลือกงาน → เลือกเส้น (ประเภทบาน → ยี่ห้อ → โปรไฟล์ 1 แถว → กดเข้าไปเลือกสี ใส่จำนวน) → บันทึก (ตัดสต็อกทันที)
 *   เจ้าของเคาะ 20 ต.ค.69: "ขึ้นโปรไฟล์เดียว แล้วค่อยกดเข้าไปเลือกสีด้านใน" · "แยกหมวดบานเลื่อน บานเปิด ตามประเภท ไม่เอาตามยี่ห้ออย่างเดียว"
 *   + แถบล่าง "ของที่ฉันเบิก" (คืน/แก้/ยกเลิก ได้เองจนกว่าสโตร์ตรวจ)
 *   กติกา: พิมพ์แค่ตัวเลขจำนวนเส้น ที่เหลือกดเลือก · ปุ่มใหญ่ ≥44px · ชื่อช่างจำไว้ในมือถือ (localStorage chang_name)
 *
 * ใช้ได้ทั้งบนลิงก์ช่าง (/chang/<token>/pick · api แนบโทเคนให้) และหน้าออฟฟิศ (สโตร์เบิกแทนช่าง)
 */
const C = { bg: "#f2f2f7", card: "#ffffff", ink: "#1c1c1e", ink2: "#636366", ink3: "#a1a1a8", blue: "#007aff", red: "#ff3b30", green: "#34c759", line: "#e5e5ea" };
const NAME_KEY = "chang_name";
const DRAFT_KEY = "alu_pick_draft_v1";

type Step = "job" | "items" | "review" | "done";
type Job = { job_id: string | null; title: string; job_code: string | null; what?: string };
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
  const [brand, setBrand] = useState<string>("");   // กรองยี่ห้อในหมวด ("" = ทุกยี่ห้อ)
  const [open, setOpen] = useState<string>("");     // โปรไฟล์ที่กางดูสีอยู่ (pkey)
  const [q, setQ] = useState("");          // ค้นเส้น
  const [jobQ, setJobQ] = useState("");    // ค้นงาน (แยกกัน กดย้อนแล้วคำค้นไม่ปนกัน)
  const [limit, setLimit] = useState(40);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<{ code: string; id: number } | null>(null);

  // ชื่อช่างที่จำไว้ · เปิดหน้ามาต้องเริ่มที่ "เบิกไปงานไหน" เสมอ
  //   (เจ้าของ 21 ต.ค.69: เคยจำร่างค้างแล้วเด้งเข้าหน้าเลือกเส้นของลูกค้าเดิม ช่างงง → เลิกจำร่าง)
  useEffect(() => {
    if (fixedName) return;
    try {
      // ออฟฟิศเบิกแทนช่าง = เลือกชื่อช่างใหม่ทุกใบ (ไม่จำ) · มือถือช่าง = จำชื่อไว้
      const n = isChang ? (localStorage.getItem(NAME_KEY) || "") : "";
      setName(n); if (!n) setAskName(true);
      localStorage.removeItem(DRAFT_KEY);   // ล้างร่างเก่าที่เครื่องช่างเคยเก็บไว้
    } catch { /* ignore */ }
  }, [fixedName, isChang]);
  const saveName = (v: string) => { setName(v); setAskName(false); if (isChang) { try { localStorage.setItem(NAME_KEY, v); } catch { /* ignore */ } } };

  const itemsQ = useQuery({ queryKey: ["alu-pick-items"], queryFn: () => api.get<{ items: PickableItem[] }>("/alu-picks/items"), staleTime: 5 * 60 * 1000 });
  const jobsQ = useQuery({ queryKey: ["alu-pick-jobs"], queryFn: () => api.get<PickJob[]>("/alu-picks/jobs"), staleTime: 30 * 1000, refetchInterval: 60 * 1000, refetchOnWindowFocus: true });
  const mineQ = useQuery({ queryKey: ["alu-picks-mine", name], queryFn: () => api.get<Pick[]>("/alu-picks?mine=1&days=60"), enabled: !!name });
  const items = itemsQ.data?.data.items ?? [];
  const jobs = jobsQ.data?.data ?? [];
  // ชุดเดียวกับบอร์ดตารางผลิตฝั่งช่าง: งานที่ผลิตเสร็จแล้ว (READY = ส่งติดตั้ง) บอร์ดซ่อน → หน้าเบิกก็ซ่อน
  //   ค้นชื่อแล้วค่อยโชว์ (เผื่อเบิกเส้นไปแก้งานที่ส่งติดตั้งไปแล้ว) พร้อมป้าย "ผลิตเสร็จแล้ว"
  const myFactory = (name.match(/โรง\s*(\d+)/) ?? [])[1] ?? "";
  const isMine = (j: PickJob) => !!myFactory && (j.factories ?? []).some((f) => (f.match(/(\d+)/) ?? [])[1] === myFactory);
  const activeJobs = useMemo(() => {
    const a = jobs.filter((j) => j.status !== "READY");
    return myFactory ? [...a.filter(isMine), ...a.filter((j) => !isMine(j))] : a;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, myFactory]);
  // ชื่อลูกค้าซ้ำหลายงาน (เช่น คุณไอซ์ 3 งาน) → ป้ายเตือนให้ดูรหัสงาน/ที่อยู่ก่อนกด
  const nameCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const j of jobs) { const k = j.title.replace(/\s+/g, ""); m.set(k, (m.get(k) ?? 0) + 1); }
    return m;
  }, [jobs]);
  const shownJobs = useMemo(() => {
    const qq = jobQ.trim().toLowerCase();
    if (!qq) return activeJobs;
    return jobs.filter((j) => `${j.title} ${(j.what ?? []).join(" ")} ${j.place ?? ""} ${j.subtitle ?? ""} ${j.sales_name ?? ""}`.toLowerCase().includes(qq));
  }, [jobQ, jobs, activeJobs]);
  const mine = mineQ.data?.data ?? [];
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  // "ที่ฉันเบิกบ่อย" = เส้นที่ช่างคนนี้เบิกบ่อยสุด 60 วัน (สูงสุด 12)
  const frequent = useMemo(() => {
    const cnt = new Map<number, number>();
    for (const p of mine) if (p.status !== "cancelled") for (const it of p.items) cnt.set(it.stock_item_id, (cnt.get(it.stock_item_id) ?? 0) + 1);
    return [...cnt].sort((a, b) => b[1] - a[1]).map(([id]) => byId.get(id)).filter((x): x is PickableItem => !!x).slice(0, 12);
  }, [mine, byId]);

  const favIds = useMemo(() => new Set(frequent.map((i) => i.id)), [frequent]);
  const inGroup = useMemo(() => (group === "fav" ? items.filter((i) => favIds.has(i.id)) : group ? items.filter((i) => i.types.includes(group)) : []), [group, items, favIds]);
  const brandsHere = useMemo(() => PICK_BRANDS.filter((b) => inGroup.some((i) => i.brand === b.key)), [inGroup]);
  // รวมทุกสีของโปรไฟล์เดียวกันเป็นแถวเดียว (pkey จาก server) · มีของขึ้นก่อน
  const profiles = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const src = qq
      ? items.filter((i) => `${i.code} ${i.sku} ${i.base} ${i.name} ${i.color}`.toLowerCase().includes(qq))
      : inGroup.filter((i) => !brand || i.brand === brand);
    const m = new Map<string, PickProfile>();
    for (const i of src) {
      const pr = m.get(i.pkey) ?? { pkey: i.pkey, code: i.code, base: i.base, image_url: "", brand: i.brand, types: i.types, colors: [], total: 0 };
      pr.colors.push(i); pr.total += Math.max(0, i.qty);
      if (!pr.image_url && i.image_url) pr.image_url = i.image_url;
      m.set(i.pkey, pr);
    }
    const arr = [...m.values()];
    for (const pr of arr) pr.colors.sort((a, b) => (Number(b.qty > 0) - Number(a.qty > 0)) || a.color.localeCompare(b.color));
    return arr.sort((a, b) => (Number(b.total > 0) - Number(a.total > 0)) || (a.code || "~").localeCompare(b.code || "~") || a.base.localeCompare(b.base));
  }, [q, items, inGroup, brand]);
  const pickGroup = (g: string) => { setGroup(g); setBrand(""); setOpen(""); setLimit(40); };

  const cartRows = useMemo(() => Object.entries(d.cart).map(([id, qty]) => ({ item: byId.get(Number(id)), id: Number(id), qty })).filter((r) => r.qty > 0), [d.cart, byId]);
  const totalBars = cartRows.reduce((s, r) => s + r.qty, 0);
  const setQty = (id: number, qty: number) => setD((x) => ({ ...x, cart: { ...x.cart, [id]: Math.max(0, Math.round(qty * 100) / 100) } }));

  const whoLabel = d.job ? `${d.job.title}${d.job.what ? " · " + d.job.what : ""}` : d.reason === "repair" ? "งานซ่อม" : d.reason === "other" ? `อื่นๆ: ${d.reasonNote}` : "";

  async function save() {
    if (!name.trim()) { setAskName(true); return; }
    setBusy(true); setErr("");
    try {
      const r = await api.post<{ id: number; code: string }>("/alu-picks", {
        job_id: d.job?.job_id ?? null, reason: d.reason, reason_note: d.reasonNote, note: d.note, picker_name: name,
        items: cartRows.map((r) => ({ stock_item_id: r.id, qty: r.qty })),
      });
      setDone(r.data); setStep("done"); setD(EMPTY); setGroup(""); setBrand(""); setOpen(""); setQ("");
      qc.invalidateQueries({ queryKey: ["alu-pick-items"] });
      qc.invalidateQueries({ queryKey: ["alu-picks-mine"] });
    } catch (e) { setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setBusy(false); }
  }
  const restart = () => { setDone(null); setStep("job"); setD(EMPTY); setGroup(""); setBrand(""); setOpen(""); setQ(""); setErr(""); if (!isChang && !fixedName) { setName(""); setAskName(true); } };

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
    <div className="overflow-x-hidden" style={{ paddingBottom: "calc(96px + env(safe-area-inset-bottom))" }}>
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
          <div className="rounded-[14px] p-3 mb-3" style={{ background: C.card }}>
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
          <input value={jobQ} onChange={(e) => setJobQ(e.target.value)} placeholder="ค้นชื่อลูกค้า / งาน / หมู่บ้าน (ไม่บังคับ)" inputMode="search"
            className="w-full rounded-[12px] px-3 min-h-[48px] text-[15px] bg-white outline-none mb-2.5" style={{ border: `1px solid ${C.line}`, color: C.ink }} />
          <div className="grid grid-cols-1 gap-2 mb-3">
            {jobsQ.isLoading && <p className="text-center py-6" style={{ color: C.ink2 }}>กำลังโหลดงาน…</p>}
            {!jobsQ.isLoading && jobsQ.isError && <p className="text-center py-4 text-[13px]" style={{ color: C.red }}>โหลดรายชื่องานไม่ได้ — ลองดึงหน้าลงเพื่อโหลดใหม่</p>}
            {!jobsQ.isLoading && !jobsQ.isError && shownJobs.length === 0 && <p className="text-center py-4 text-[13px]" style={{ color: C.ink3 }}>{jobQ.trim() ? "ไม่พบงานชื่อนี้" : "ไม่มีงานในตารางผลิตตอนนี้"}</p>}
            {shownJobs.slice(0, 60).map((j) => {
              const dup = (nameCount.get(j.title.replace(/\s+/g, "")) ?? 0) > 1;
              const done = j.status === "READY";
              return (
                <button key={j.job_id} onClick={() => { setD({ ...d, job: { job_id: j.job_id, title: j.title, job_code: j.job_code, what: (j.what ?? [])[0] ?? j.place ?? "" }, reason: "", reasonNote: "" }); setStep("items"); }}
                  className="min-w-0 min-h-[56px] rounded-[14px] px-4 py-2.5 text-left flex flex-col justify-center gap-0.5" style={{ background: C.card, opacity: done ? 0.75 : 1 }}>
                  <span className="flex w-full items-center gap-1.5 min-w-0">
                    <span className="text-[16px] font-bold truncate" style={{ color: C.ink }}>{j.title}</span>
                    {dup && <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: "#fff3e0", color: "#b26a00" }}>ชื่อซ้ำ ดูงาน/ที่อยู่</span>}
                    {done && <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: C.bg, color: C.ink2 }}>ผลิตเสร็จแล้ว</span>}
                    {isMine(j) && !done && <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: "#e8f4ff", color: C.blue }}>โรงคุณ</span>}
                  </span>
                  {/* ทำอะไร — สิ่งที่ช่างจำงานได้ (เจ้าของ: "ช่างไม่รู้รหัส") */}
                  {(j.what ?? []).length > 0 && (
                    <span className="block w-full text-[13.5px] font-semibold leading-snug" style={{ color: C.ink, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      🔨 {(j.what ?? []).slice(0, 2).join(" · ")}{(j.what ?? []).length > 2 ? ` +อีก ${(j.what ?? []).length - 2} ชุด` : ""}
                    </span>
                  )}
                  <span className="block w-full text-[12.5px] truncate" style={{ color: C.ink2 }}>
                    {[
                      j.place ? `📍 ${j.place}` : "",
                      j.due_date ? `เสร็จ ${fmtDay(j.due_date)}` : "",
                      (j.factories ?? []).length ? (j.factories ?? []).map(shortFactory).join(",") : "",
                      j.sales_name ? `เซลล์ ${j.sales_name}` : "",
                    ].filter(Boolean).join(" · ")}
                  </span>
                </button>
              );
            })}
            {!jobQ.trim() && jobs.length > activeJobs.length && (
              <p className="text-center text-[12px] py-1" style={{ color: C.ink3 }}>งานที่ผลิตเสร็จแล้ว ({jobs.length - activeJobs.length} งาน) ไม่โชว์ — พิมพ์ชื่อค้นได้</p>
            )}
          </div>
        </Shell>
      ) : step === "items" ? (
        <Shell title={whoLabel} sub="กดประเภทบาน → กดโปรไฟล์ → เลือกสี ใส่จำนวน" onBack={() => setStep("job")}>
          <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(""); }} placeholder="หรือพิมพ์รหัส/ชื่อ เช่น B22" inputMode="search"
            className="w-full rounded-[12px] px-3 min-h-[48px] text-[15px] bg-white outline-none mb-2.5" style={{ border: `1px solid ${C.line}`, color: C.ink }} />
          {!q.trim() && (
            <>
              {!group ? (
                <div className="grid grid-cols-3 gap-2 mb-2.5">
                  {frequent.length > 0 && <GroupBtn on={false} label="⭐ เบิกบ่อย" onClick={() => pickGroup("fav")} />}
                  {PICK_TYPES.filter((t) => items.some((i) => i.types.includes(t.key))).map((t) => (
                    <GroupBtn key={t.key} on={false} label={t.label} onClick={() => pickGroup(t.key)} />
                  ))}
                </div>
              ) : (
                <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1">
                  {frequent.length > 0 && <Chip on={group === "fav"} label="⭐ เบิกบ่อย" onClick={() => pickGroup("fav")} />}
                  {PICK_TYPES.filter((t) => items.some((i) => i.types.includes(t.key))).map((t) => (
                    <Chip key={t.key} on={group === t.key} label={t.label} onClick={() => pickGroup(t.key)} />
                  ))}
                </div>
              )}
              {group && group !== "fav" && brandsHere.length > 1 && (
                <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1">
                  <Chip tone="brand" on={!brand} label="ทุกยี่ห้อ" onClick={() => { setBrand(""); setOpen(""); setLimit(40); }} />
                  {brandsHere.map((b) => <Chip tone="brand" key={b.key} on={brand === b.key} label={b.label} onClick={() => { setBrand(b.key); setOpen(""); setLimit(40); }} />)}
                </div>
              )}
            </>
          )}
          {itemsQ.isLoading ? <p className="text-center py-8" style={{ color: C.ink2 }}>กำลังโหลดรายการเส้น…</p>
            : !group && !q.trim() ? <p className="text-center py-8 text-[14px]" style={{ color: C.ink3 }}>กดประเภทบานด้านบนก่อน</p>
              : profiles.length === 0 ? <p className="text-center py-8 text-[14px]" style={{ color: C.ink3 }}>ไม่พบเส้นในหมวดนี้</p>
                : (
                  <div className="grid grid-cols-1 gap-1.5">
                    {profiles.slice(0, limit).map((pr) => (
                      <ProfileRow key={pr.pkey} p={pr} open={open === pr.pkey || pr.colors.length === 1}
                        onToggle={() => setOpen(open === pr.pkey ? "" : pr.pkey)} cart={d.cart} onQty={setQty} />
                    ))}
                    {profiles.length > limit && <button onClick={() => setLimit(limit + 40)} className="min-h-[44px] rounded-[12px] text-[14px] font-semibold" style={{ background: C.card, color: C.blue }}>แสดงเพิ่ม ({profiles.length - limit} โปรไฟล์)</button>}
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
    <button onClick={onClick} className="min-w-0 min-h-[56px] rounded-[14px] px-1.5 py-1.5 flex flex-col items-center justify-center text-center leading-tight"
      style={{ background: on ? C.blue : C.card, color: on ? "#fff" : C.ink }}>
      {sub && <span className="text-[10.5px]" style={{ color: on ? "rgba(255,255,255,.8)" : C.ink2 }}>{sub}</span>}
      <span className="text-[14.5px] font-bold break-words">{label}</span>
    </button>
  );
}
function Chip({ on, label, onClick, tone }: { on: boolean; label: string; onClick: () => void; tone?: "brand" }) {
  const onBg = tone === "brand" ? C.ink : C.blue;   // หมวด = ฟ้า · ยี่ห้อ = ดำ
  return <button onClick={onClick} className="shrink-0 whitespace-nowrap rounded-full px-3.5 min-h-[40px] text-[14px] font-semibold" style={{ background: on ? onBg : C.card, color: on ? "#fff" : C.ink }}>{label}</button>;
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
/** 1 แถว = 1 โปรไฟล์ · กดแล้วกางสีด้านใน (โปรไฟล์ที่มีสีเดียว กางให้เลย) */
function ProfileRow({ p, open, onToggle, cart, onQty }: {
  p: PickProfile; open: boolean; onToggle: () => void; cart: Record<string, number>; onQty: (id: number, v: number) => void;
}) {
  const picked = p.colors.reduce((s, c) => s + (cart[c.id] ?? 0), 0);
  const brandLabel = PICK_BRANDS.find((b) => b.key === p.brand)?.label ?? "";
  return (
    <div className="min-w-0 rounded-[14px] overflow-hidden" style={{ background: C.card, outline: picked > 0 ? `2px solid ${C.blue}` : "none" }}>
      <button onClick={onToggle} className="w-full flex items-center gap-2.5 px-2.5 py-2 text-left min-h-[64px]">
        <Thumb url={p.image_url} size={48} />
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold leading-tight" style={{ color: C.ink }}>{p.code ? `${p.code} ` : ""}{p.base}</div>
          <div className="text-[12px]" style={{ color: C.ink2 }}>
            {brandLabel ? `${brandLabel} · ` : ""}{p.colors.length} สี · มีรวม <b style={{ color: p.total > 0 ? C.ink2 : C.red }}>{fmtQty(p.total)}</b> {p.colors[0]?.unit ?? "เส้น"}
          </div>
        </div>
        {picked > 0 && <span className="shrink-0 rounded-full px-2.5 py-1 text-[13px] font-bold text-white" style={{ background: C.blue }}>{fmtQty(picked)}</span>}
        {p.colors.length > 1 && <span className="shrink-0 text-[20px]" style={{ color: C.ink3 }}>{open ? "▾" : "›"}</span>}
      </button>
      {open && (
        <div className="px-2.5 pb-2 grid gap-1" style={{ borderTop: `1px solid ${C.line}` }}>
          {p.colors.map((c) => {
            const q = cart[c.id] ?? 0;
            return (
              <div key={c.id} className="flex items-center gap-2 pt-1.5">
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-semibold" style={{ color: C.ink }}>{c.color || "ไม่ระบุสี"}</div>
                  <div className="text-[12px]" style={{ color: C.ink2 }}>เหลือ <b style={{ color: c.qty <= 0 ? C.red : C.ink2 }}>{fmtQty(c.qty)}</b></div>
                </div>
                <Stepper qty={q} onQty={(v) => onQty(c.id, v)} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
function Stepper({ qty, onQty }: { qty: number; onQty: (v: number) => void }) {
  const on = qty > 0;
  return (
    <div className="flex items-center gap-1 shrink-0">
      <button onClick={() => onQty(qty - 1)} disabled={!on} className="min-h-[44px] min-w-[44px] rounded-[10px] text-[22px] font-bold disabled:opacity-30" style={{ background: C.bg, color: C.ink }}>−</button>
      <input inputMode="decimal" value={on ? fmtQty(qty) : ""} placeholder="0" onChange={(e) => onQty(Number(e.target.value) || 0)}
        className="w-[52px] min-h-[44px] rounded-[10px] text-center text-[17px] font-bold outline-none" style={{ background: on ? "#e8f4ff" : C.bg, color: C.ink }} />
      <button onClick={() => onQty(qty + 1)} className="min-h-[44px] min-w-[44px] rounded-[10px] text-[22px] font-bold text-white" style={{ background: C.blue }}>+</button>
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
