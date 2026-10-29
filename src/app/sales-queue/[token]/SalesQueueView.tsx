"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dayLabel, dayColor, thaiDate, JOB_SIZE_META, type JobSize } from "@/lib/queue";

// หน้าคิวประเมินมือถือของเซลล์ — ดูอย่างเดียว (ข้อมูลมาจาก page.tsx ฝั่ง server · ไม่มีปุ่มแก้)

export type SqSales = { id: string; name: string; team: "BKK" | "PHUKET"; role: "MAIN" | "ASSISTANT"; parent_sales_id: string | null };
export type SqEntry = {
  id: string; status: "PENDING" | "PROPOSED" | "CONFIRMED" | "DONE" | "CANCELLED";
  queue_date: string | null; queue_time: string | null; job_type: string | null;
  sales_id: string | null; assistant_id: string | null;
  line_contact: string | null; contact_channel: string | null;
  customer_name: string; tel: string | null; address: string | null; location_url: string | null;
  lat: number | null; lng: number | null; job_size: JobSize | null; job_count: number | null;
  assess_fee: number | null; fee_paid: boolean | null; note_admin: string | null;
};
export type SqAvail = { sales_id: string; date: string; kind: string; half: "AM" | "PM" | null; note: string | null };

const ALL = "all";
const LS_KEY = "sq.sales";

const STATUS: Record<SqEntry["status"], { th: string; cls: string }> = {
  PENDING:   { th: "รอจัด",          cls: "bg-stone-100 text-stone-600" },
  PROPOSED:  { th: "รอลูกค้ายืนยัน", cls: "bg-amber-100 text-amber-800" },
  CONFIRMED: { th: "ยืนยันแล้ว",     cls: "bg-emerald-100 text-emerald-800" },
  DONE:      { th: "เข้าแล้ว",       cls: "bg-stone-200 text-stone-600" },
  CANCELLED: { th: "ยกเลิก",         cls: "bg-red-100 text-red-700" },
};

const BTN = "flex-1 rounded-xl bg-stone-100 py-2.5 text-center text-[14px] font-semibold text-stone-800 active:bg-stone-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b3151d]";

// "2026-10-29" → "29 ต.ค." (หัววันไม่ต้องมีปี)
const dayShort = (iso: string) => thaiDate(iso).replace(/\s\d{4}$/, "");

const HALF_TH = { AM: "เช้า", PM: "บ่าย" } as const;
function availLabel(a: SqAvail): string {
  const h = a.half ? HALF_TH[a.half] : "";
  switch (a.kind) {
    case "LEAVE_FULL": return "ลาทั้งวัน";
    case "LEAVE_HALF": return `ลา${h || "ครึ่งวัน"}`;
    case "OFFICE_HALF": return `เข้าออฟฟิศ${h}`;
    case "WFH": return "WFH ไม่ออกหน้างาน";
    case "HOLIDAY": return "วันหยุด";
    default: return a.kind;
  }
}

// "9:30" / "10.00" / "14:00:00" → "09.30" · ไม่มีเวลา → ""
function fmtTime(t: string | null): string {
  const m = String(t ?? "").match(/(\d{1,2})[:.](\d{2})/);
  return m ? `${m[1].padStart(2, "0")}.${m[2]}` : "";
}
const timeKey = (t: string | null) => fmtTime(t) || "99.99";

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function mapHref(e: SqEntry): string | null {
  const u = e.location_url?.trim();
  if (u && /^https?:\/\//i.test(u)) return u;
  if (e.lat != null && e.lng != null) return `https://www.google.com/maps/search/?api=1&query=${e.lat},${e.lng}`;
  if (e.address?.trim()) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.address.trim())}`;
  return null;
}

export default function SalesQueueView({ today, sales, entries, avail }: {
  today: string; sales: SqSales[]; entries: SqEntry[]; avail: SqAvail[];
}) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [who, setWho] = useState<string>(ALL);
  const [view, setView] = useState<"next" | "past">("next");
  const [updatedAt, setUpdatedAt] = useState<string>("");
  // หัววันตรึงใต้หัวหน้า — วัดความสูงจริง (ชื่อยาว/ฟอนต์ใหญ่ในมือถือ ทำให้หัวสูงไม่เท่ากัน)
  const headRef = useRef<HTMLElement>(null);
  const [headH, setHeadH] = useState(118);
  useEffect(() => {
    const el = headRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeadH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const salesById = useMemo(() => new Map(sales.map((s) => [s.id, s])), [sales]);
  // เซลล์หลักก่อน (กทม. → ภูเก็ต) แล้วผู้ช่วย
  const mains = sales.filter((s) => s.role === "MAIN");
  const assistants = sales.filter((s) => s.role === "ASSISTANT");

  // จำคนที่เลือกไว้ในเครื่อง + ?s= ในลิงก์ (ส่งลิงก์เจาะชื่อได้)
  useEffect(() => {
    let pick: string | null = new URLSearchParams(window.location.search).get("s");
    if (!pick) { try { pick = localStorage.getItem(LS_KEY); } catch { /* private mode */ } }
    if (pick && (pick === ALL || salesById.has(pick))) setWho(pick);
  }, [salesById]);

  // ชื่อที่เลือกอยู่ท้ายแถว (เลื่อนข้าง) → เลื่อนให้เห็น
  useEffect(() => {
    document.querySelector('nav [aria-pressed="true"]')?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [who]);

  function choose(id: string) {
    setWho(id);
    try { localStorage.setItem(LS_KEY, id); } catch { /* ignore */ }
    const u = new URL(window.location.href);
    if (id === ALL) u.searchParams.delete("s"); else u.searchParams.set("s", id);
    window.history.replaceState(null, "", u.toString());
    window.scrollTo({ top: 0 });
  }

  // ดึงข้อมูลใหม่: กลับมาเปิดแอป + ทุก 3 นาที
  useEffect(() => {
    setUpdatedAt(new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }));
  }, [entries]);
  useEffect(() => {
    const refresh = () => startRefresh(() => router.refresh());
    const onVis = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVis);
    const t = window.setInterval(refresh, 180_000);
    return () => { document.removeEventListener("visibilitychange", onVis); window.clearInterval(t); };
  }, [router]);

  const mine = useMemo(
    () => (who === ALL ? entries : entries.filter((e) => e.sales_id === who || e.assistant_id === who)),
    [entries, who],
  );

  const tomorrow = addDays(today, 1);
  const weekEnd = addDays(today, 6);
  const countNext = (id: string) =>
    entries.filter((e) => e.queue_date && e.queue_date >= today && (e.sales_id === id || e.assistant_id === id)).length;
  const summary = {
    today: mine.filter((e) => e.queue_date === today).length,
    tomorrow: mine.filter((e) => e.queue_date === tomorrow).length,
    week: mine.filter((e) => e.queue_date && e.queue_date >= today && e.queue_date <= weekEnd).length,
  };

  const days = useMemo(() => {
    const dated = mine.filter((e) => e.queue_date && (view === "next" ? e.queue_date >= today : e.queue_date < today));
    const map = new Map<string, SqEntry[]>();
    for (const e of dated) {
      const k = e.queue_date as string;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(e);
    }
    const keys = [...map.keys()].sort();
    if (view === "past") keys.reverse();
    return keys.map((d) => ({
      date: d,
      list: map.get(d)!.sort((a, b) => timeKey(a.queue_time).localeCompare(timeKey(b.queue_time))
        || (salesById.get(a.sales_id ?? "")?.name ?? "").localeCompare(salesById.get(b.sales_id ?? "")?.name ?? "")),
    }));
  }, [mine, view, today, salesById]);

  const undated = view === "next" && who !== ALL ? mine.filter((e) => !e.queue_date) : [];

  const availFor = (date: string) =>
    avail.filter((a) => a.date === date && (who === ALL ? true : a.sales_id === who));

  const whoName = who === ALL ? "ทุกคน" : salesById.get(who)?.name ?? "";

  return (
    <div className="min-h-[100dvh] bg-[#f3f3f5] text-stone-900 [font-variant-numeric:tabular-nums]">
      {/* หัว + เลือกเซลล์ — ตรึงบน */}
      <header ref={headRef} className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-stone-200">
        <div className="mx-auto max-w-xl px-4 pt-3 pb-2 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold tracking-wide text-[#b3151d]">JR · คิวประเมินหน้างาน</div>
            <h1 className="text-[22px] font-bold leading-tight truncate">{whoName}</h1>
          </div>
          <button
            onClick={() => startRefresh(() => router.refresh())}
            disabled={refreshing}
            className="shrink-0 rounded-full border border-stone-200 bg-white px-3 py-2 text-[13px] font-semibold text-stone-600 active:scale-95 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b3151d]"
            aria-label="ดึงคิวล่าสุด"
          >
            <span className={refreshing ? "inline-block animate-spin" : "inline-block"}>↻</span>{" "}
            {refreshing ? "กำลังโหลด" : updatedAt ? `อัปเดต ${updatedAt}` : "รีเฟรช"}
          </button>
        </div>

        <nav className="mx-auto max-w-xl overflow-x-auto px-4 pb-2.5 [scrollbar-width:none]" aria-label="เลือกเซลล์">
          <div className="flex gap-2 w-max">
            <Chip active={who === ALL} onClick={() => choose(ALL)} label="ทุกคน" />
            {mains.map((s) => (
              <Chip key={s.id} active={who === s.id} onClick={() => choose(s.id)}
                label={s.name} sub={s.team === "PHUKET" ? "ภูเก็ต" : undefined} count={countNext(s.id)} />
            ))}
            {assistants.length > 0 && <span className="self-center mx-1 h-5 w-px bg-stone-300" aria-hidden />}
            {assistants.map((s) => (
              <Chip key={s.id} small active={who === s.id} onClick={() => choose(s.id)}
                label={s.name} count={countNext(s.id)} />
            ))}
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-xl px-4 pb-16">
        {/* สรุปสั้น */}
        <div className="grid grid-cols-3 gap-2 pt-3">
          <Stat label="วันนี้" n={summary.today} hot />
          <Stat label="พรุ่งนี้" n={summary.tomorrow} />
          <Stat label="7 วันนี้" n={summary.week} />
        </div>

        {/* ต่อจากนี้ / ย้อนหลัง */}
        <div className="mt-3 grid grid-cols-2 rounded-xl bg-stone-200/70 p-1 text-[14px] font-semibold" role="tablist">
          {([["next", "คิวต่อจากนี้"], ["past", "ย้อนหลัง 14 วัน"]] as const).map(([k, th]) => (
            <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)}
              className={`rounded-lg py-2 transition-colors ${view === k ? "bg-white text-stone-900 shadow-sm" : "text-stone-500"}`}>
              {th}
            </button>
          ))}
        </div>

        {days.length === 0 && undated.length === 0 && (
          <div className="mt-10 text-center text-stone-500">
            <div className="text-[15px] font-semibold">ไม่มีคิว{view === "next" ? "ที่นัดไว้" : "ย้อนหลัง"}</div>
            <div className="text-[13px] mt-1">{who === ALL ? "" : `ของ ${whoName}`}</div>
          </div>
        )}

        {days.map(({ date, list }) => {
          const dc = dayColor(date);
          const tag = date === today ? "วันนี้" : date === tomorrow ? "พรุ่งนี้" : "";
          const av = availFor(date);
          return (
            <section key={date} className="mt-5" aria-label={thaiDate(date)}>
              <div style={{ top: headH }} className="sticky z-10 -mx-4 px-4 py-2 bg-[#f3f3f5]/95 backdrop-blur flex items-center gap-2 flex-wrap">
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: dc?.dot }} aria-hidden />
                <span className="text-[16px] font-bold">{dayLabel(date)} {dayShort(date)}</span>
                {tag && <span className="rounded-full bg-[#b3151d] px-2 py-0.5 text-[11px] font-bold text-white">{tag}</span>}
                <span className="ml-auto text-[13px] text-stone-500">{list.length} คิว</span>
                {av.length > 0 && (
                  <div className="basis-full flex flex-wrap gap-1.5">
                    {av.map((a, i) => (
                      <span key={i} className="rounded-md bg-violet-100 px-2 py-0.5 text-[12px] font-semibold text-violet-800">
                        {who === ALL ? `${salesById.get(a.sales_id)?.name ?? ""} · ` : ""}{availLabel(a)}{a.note ? ` (${a.note})` : ""}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2.5">
                {list.map((e) => <EntryCard key={e.id} e={e} showSales={who === ALL} salesById={salesById} />)}
              </div>
            </section>
          );
        })}

        {undated.length > 0 && (
          <section className="mt-6" aria-label="ยังไม่ลงวัน">
            <div className="py-2 text-[16px] font-bold text-stone-600">ยังไม่ลงวัน · {undated.length}</div>
            <div className="flex flex-col gap-2.5">
              {undated.map((e) => <EntryCard key={e.id} e={e} showSales={false} salesById={salesById} />)}
            </div>
          </section>
        )}

        <p className="mt-10 text-center text-[12px] text-stone-400">หน้านี้ดูอย่างเดียว · ต้องการเปลี่ยนคิวแจ้งออฟฟิศ</p>
      </main>
    </div>
  );
}

function Chip({ label, sub, count, active, small, onClick }: {
  label: string; sub?: string; count?: number; active: boolean; small?: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick} aria-pressed={active}
      className={`shrink-0 rounded-full border font-semibold active:scale-95 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b3151d]
        ${small ? "px-3 py-1.5 text-[13px]" : "px-3.5 py-2 text-[15px]"}
        ${active ? "bg-[#b3151d] border-[#b3151d] text-white" : "bg-white border-stone-200 text-stone-700"}`}>
      {label}
      {sub && <span className={`ml-1 text-[11px] ${active ? "text-white/80" : "text-stone-400"}`}>{sub}</span>}
      {count ? (
        <span className={`ml-1.5 inline-block min-w-[20px] rounded-full px-1.5 text-[12px] ${active ? "bg-white/25" : "bg-stone-100 text-stone-500"}`}>{count}</span>
      ) : null}
    </button>
  );
}

function Stat({ label, n, hot }: { label: string; n: number; hot?: boolean }) {
  return (
    <div className="rounded-xl bg-white border border-stone-200 px-3 py-2">
      <div className="text-[12px] text-stone-500">{label}</div>
      <div className={`text-[24px] font-bold leading-tight ${hot && n > 0 ? "text-[#b3151d]" : ""}`}>{n}</div>
    </div>
  );
}

function EntryCard({ e, showSales, salesById }: { e: SqEntry; showSales: boolean; salesById: Map<string, SqSales> }) {
  const [copied, setCopied] = useState(false);
  const t = fmtTime(e.queue_time);
  const st = STATUS[e.status];
  const map = mapHref(e);
  const tel = e.tel?.trim();
  const telDigits = tel?.replace(/[^\d+]/g, "");
  const size = e.job_size ? JOB_SIZE_META[e.job_size] + (e.job_size === "MULTI" && e.job_count ? ` ${e.job_count} จุด` : "") : "";
  const salesName = e.sales_id ? salesById.get(e.sales_id)?.name : "";
  const asstName = e.assistant_id ? salesById.get(e.assistant_id)?.name : "";
  const done = e.status === "DONE";
  const line = e.line_contact?.trim() ?? "";
  const channel = e.contact_channel === "FB" ? "FB" : "LINE";

  async function copyLine() {
    if (!line) return;
    try { await navigator.clipboard.writeText(line); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  }

  return (
    <article className={`rounded-2xl bg-white border border-stone-200 p-3.5 ${done ? "opacity-60" : ""}`}>
      <div className="flex gap-3">
        <div className="w-[58px] shrink-0 text-center">
          <div className="text-[20px] font-bold leading-none">{t || "—"}</div>
          <div className="mt-1 text-[11px] text-stone-400">{t ? "น." : "ไม่ระบุเวลา"}</div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <h2 className="flex-1 text-[17px] font-bold leading-snug break-words">{e.customer_name}</h2>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${st.cls}`}>{st.th}</span>
          </div>
          <div className="mt-0.5 text-[13.5px] text-stone-600">
            {[e.job_type || "ประเมินหน้างาน", size].filter(Boolean).join(" · ")}
            {showSales && salesName && <span className="ml-1.5 rounded bg-stone-100 px-1.5 py-0.5 text-[12px] font-semibold text-stone-700">{salesName}</span>}
          </div>
          {e.address?.trim() && <p className="mt-1.5 text-[14px] leading-snug text-stone-800 whitespace-pre-line">{e.address.trim()}</p>}

          <dl className="mt-2 grid gap-1 text-[13px]">
            {e.assess_fee != null && (
              <div className="flex gap-1.5">
                <dt className="text-stone-500">ค่าประเมิน</dt>
                <dd className="font-semibold">{e.assess_fee.toLocaleString("th-TH")} บ.</dd>
                <dd className={e.fee_paid ? "text-emerald-700" : "text-amber-700"}>{e.fee_paid ? "· ชำระแล้ว" : "· ยังไม่ชำระ"}</dd>
              </div>
            )}
            {tel && (
              <div className="flex gap-1.5"><dt className="text-stone-500">โทร</dt><dd className="font-semibold">{tel}</dd></div>
            )}
            {line && (
              <div className="flex gap-1.5 min-w-0"><dt className="text-stone-500">{channel}</dt><dd className="font-semibold break-all">{line}</dd></div>
            )}
            {asstName && (
              <div className="flex gap-1.5"><dt className="text-stone-500">ไปกับ</dt><dd className="font-semibold">{asstName}</dd></div>
            )}
          </dl>
          {e.note_admin?.trim() && (
            <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[13px] leading-snug text-amber-900 whitespace-pre-line">{e.note_admin.trim()}</p>
          )}
        </div>
      </div>

      {(tel || map || line) && (
        <div className="mt-3 flex gap-2">
          {tel && (
            <a href={`tel:${telDigits}`} className={BTN}>โทร</a>
          )}
          {map && (
            <a href={map} target="_blank" rel="noopener noreferrer" className={BTN}>แผนที่</a>
          )}
          {line && (
            <button onClick={copyLine} className={BTN} title={`คัดลอกชื่อ ${channel}`}>
              {copied ? "คัดลอกแล้ว" : `คัดลอก ${channel}`}
            </button>
          )}
        </div>
      )}
    </article>
  );
}
