"use client";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Thumb } from "@/components/alu-pick/PickList";
import { fmtQty, type PickableItem } from "@/components/alu-pick/types";

/**
 * สรุปคงเหลืออลู — ตาราง 1 แถว = 1 หน้าตัด · 1 คอลัมน์ = 1 สี (เจ้าของสั่ง 20 ต.ค.69)
 *   "ตารางไล่ลงมายาว ๆ ตามรุ่น · คอลัมน์ อลู(รูปหน้าตัด) สี… สี… เขียนจำนวนว่าสีนั้นมีกี่เส้น
 *    ถ้าหน้าตัดนั้นไม่มีสีนั้นก็ติดเทา · เลื่อนแล้วหัวตารางเลื่อนตาม · เหมาะกับมือถือ · แก้จำนวนได้ · กรองตามประเภท"
 *   ข้อมูลชุดเดียวกับหน้าเบิกอลูของช่าง (/api/alu-picks/items — หมวดเดียวกัน ไม่รวมหลังคา · ไม่มีราคา)
 *   แก้จำนวน = ปรับยอด (adjust) ผ่าน /api/stock/[id]/move → ลงสมุดสโตร์ "แก้ในตารางสรุป"
 */
type Group = { key: string; label: string };
type Profile = { pkey: string; code: string; base: string; image_url: string; brand: string; type: string; byColor: Map<string, PickableItem> };

/** ลำดับสีมาตรฐาน (ซ้าย→ขวา) — สีอื่นที่ไม่อยู่ในนี้ต่อท้าย */
const COLOR_ORDER = ["อบขาว", "ดำ", "เทาซาฮาร่า", "ดำซาฮาร่า", "Aztec gray", "ลายไม้สักทอง", "มะฮอกกานี", "ไวท์โอ็ค", "ไวท์โอ๊ค", "มิว"];
/** ชื่อหัวคอลัมน์แบบสั้น (มือถือจอแคบ) */
const COLOR_SHORT: Record<string, string> = {
  "อบขาว": "ขาว", "ดำ": "ดำ", "เทาซาฮาร่า": "เทา", "ดำซาฮาร่า": "ดำซฮ.", "Aztec gray": "แอทแทค",
  "ลายไม้สักทอง": "สักทอง", "มะฮอกกานี": "มะฮอก", "ไวท์โอ็ค": "ไวท์โอ๊ค", "ไวท์โอ๊ค": "ไวท์โอ๊ค", "มิว": "มิว",
};
// สโตร์สะกดสีไม่เหมือนกัน (ไวท์โอ็ค/ไวท์โอ๊ค · Aztec gray/Aztecgray) → รวมเป็นคอลัมน์เดียว
const COLOR_ALIAS: Record<string, string> = { "ไวท์โอ็ค": "ไวท์โอ๊ค", "Aztecgray": "Aztec gray", "aztec gray": "Aztec gray", "ขาว": "อบขาว" };
const normColor = (c: string) => { const t = String(c ?? "").replace(/[()]/g, "").trim(); return COLOR_ALIAS[t] ?? (t || "ไม่ระบุสี"); };
const colorRank = (c: string) => { const i = COLOR_ORDER.indexOf(c); return i < 0 ? 100 : i; };

export default function AluSummary({ canWrite }: { canWrite: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["alu-pick-items"],
    queryFn: () => api.get<{ items: PickableItem[]; types: Group[]; brands: Group[] }>("/alu-picks/items"),
    staleTime: 60 * 1000,
  });
  const items = q.data?.data.items ?? [];
  const types = q.data?.data.types ?? [];
  const brands = q.data?.data.brands ?? [];
  const [type, setType] = useState("");
  const [brand, setBrand] = useState("");
  const [search, setSearch] = useState("");
  const [onlyHave, setOnlyHave] = useState(false);
  const [edit, setEdit] = useState<PickableItem | null>(null);

  // หน้าตัด (รวมทุกสี) · "ทุกประเภท" = จัดเข้าประเภทแรกของเส้น (ไม่ซ้ำแถว) · เลือกประเภท = ทุกเส้นที่ใช้กับประเภทนั้น
  const { sections, colors } = useMemo(() => {
    const qq = search.trim().toLowerCase();
    const src = items.filter((i) =>
      (!type || i.types.includes(type)) && (!brand || i.brand === brand) &&
      (!qq || `${i.code} ${i.sku} ${i.base} ${i.name}`.toLowerCase().includes(qq)));
    const map = new Map<string, Profile>();
    for (const i of src) {
      const t = type || i.types[0] || "other";
      const key = `${t}|${i.pkey}`;
      const p = map.get(key) ?? { pkey: i.pkey, code: i.code, base: i.base, image_url: "", brand: i.brand, type: t, byColor: new Map() };
      const c = normColor(i.color);
      // สีเดียวกันซ้ำ 2 แถวในสโตร์ (ไม่ควรมี) → รวมยอดโชว์ แต่แก้จำนวนได้เฉพาะแถวแรก
      const prev = p.byColor.get(c);
      p.byColor.set(c, prev ? { ...prev, qty: prev.qty + i.qty } : i);
      if (!p.image_url && i.image_url) p.image_url = i.image_url;
      map.set(key, p);
    }
    let list = [...map.values()];
    if (onlyHave) list = list.filter((p) => [...p.byColor.values()].some((x) => x.qty > 0));
    const colorSet = new Set<string>();
    for (const p of list) for (const c of p.byColor.keys()) colorSet.add(c);
    const cols = [...colorSet].sort((a, b) => colorRank(a) - colorRank(b) || a.localeCompare(b));
    const order = types.map((t) => t.key);
    const secs = order
      .map((k) => ({ key: k, label: types.find((t) => t.key === k)?.label ?? k, rows: list.filter((p) => p.type === k) }))
      .filter((s) => s.rows.length)
      // มีรหัส B/F ขึ้นก่อน เรียงตามรหัส · เส้นไม่มีรหัส (กล่อง/ฉาก/ต่อกลาง…) ตามหลัง เรียงตามชื่อ
      .map((s) => ({ ...s, rows: s.rows.sort((a, b) => (Number(!a.code) - Number(!b.code)) || a.code.localeCompare(b.code) || a.base.localeCompare(b.base, "th", { numeric: true })) }));
    return { sections: secs, colors: cols };
  }, [items, type, brand, search, onlyHave, types]);

  const totalBars = sections.reduce((s, sec) => s + sec.rows.reduce((t, p) => t + [...p.byColor.values()].reduce((u, x) => u + Math.max(0, x.qty), 0), 0), 0);
  const brandsHere = brands.filter((b) => items.some((i) => i.brand === b.key && (!type || i.types.includes(type))));

  return (
    <div className="space-y-3">
      {/* ตัวกรอง: ประเภท (ฟ้า) · ยี่ห้อ · ค้น · เฉพาะที่มีของ */}
      <div className="glass-card rounded-2xl p-3 space-y-2">
        <div className="flex flex-wrap gap-1.5">
          <Chip on={!type} onClick={() => { setType(""); setBrand(""); }}>ทุกประเภท</Chip>
          {types.filter((t) => items.some((i) => i.types.includes(t.key))).map((t) => (
            <Chip key={t.key} on={type === t.key} onClick={() => { setType(t.key); setBrand(""); }}>{t.label}</Chip>
          ))}
        </div>
        {brandsHere.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            <Chip dark on={!brand} onClick={() => setBrand("")}>ทุกยี่ห้อ</Chip>
            {brandsHere.map((b) => <Chip dark key={b.key} on={brand === b.key} onClick={() => setBrand(b.key)}>{b.label}</Chip>)}
          </div>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นรหัส/ชื่อ เช่น B22" inputMode="search"
            className="glass-soft rounded-lg px-3 py-2 text-sm outline-none flex-1 min-w-[160px]" />
          <label className="flex items-center gap-1.5 text-sm text-ink-2 whitespace-nowrap">
            <input type="checkbox" checked={onlyHave} onChange={(e) => setOnlyHave(e.target.checked)} /> เฉพาะที่มีของ
          </label>
        </div>
        <p className="text-xs text-ink-3">
          {sections.reduce((s, x) => s + x.rows.length, 0)} หน้าตัด · รวม {fmtQty(totalBars)} เส้น · ช่องเทา = หน้าตัดนี้ไม่มีสีนั้นในสโตร์
          {canWrite ? " · กดตัวเลขเพื่อแก้จำนวน" : ""}
        </p>
      </div>

      {q.isLoading ? <p className="text-center py-10 text-ink-3">กำลังโหลด…</p>
        : q.isError ? <p className="text-center py-10 text-red-600">โหลดไม่สำเร็จ — ลองกดรีเฟรช</p>
          : sections.length === 0 ? <p className="text-center py-10 text-ink-3">ไม่พบเส้นตามตัวกรองนี้</p>
            : (
              <>
              {/* มือถือ (เจ้าของ 20 ต.ค.69 "ไม่ถนัดเลื่อนซ้ายขวา"): การ์ดต่อหน้าตัด เลื่อนลงอย่างเดียว · หัวประเภทติดบน */}
              <div className="md:hidden space-y-2">
                {sections.map((sec) => (
                  <div key={sec.key}>
                    <div className="sticky top-0 z-20 py-1">
                      <div className="rounded-xl bg-white/95 shadow-sm px-3 py-2 text-[14px] font-bold text-brand-dark">{sec.label} <span className="font-normal text-ink-3">({sec.rows.length})</span></div>
                    </div>
                    <div className="space-y-2 mt-1">
                      {sec.rows.map((p) => <ProfileCard key={p.pkey} p={p} canWrite={canWrite} onEdit={setEdit} />)}
                    </div>
                  </div>
                ))}
              </div>
              {/* จอกว้าง: ตารางหน้าตัด × สี · หัวตาราง sticky บน + คอลัมน์รูป sticky ซ้าย */}
              <div className="hidden md:block rounded-2xl bg-white shadow-sm overflow-auto max-h-[calc(100dvh-220px)]" style={{ WebkitOverflowScrolling: "touch" }}>
                <table className="border-separate border-spacing-0 text-[13px] tabular-nums" style={{ minWidth: "100%" }}>
                  <thead>
                    <tr>
                      <th className="sticky top-0 left-0 z-30 bg-white text-left font-semibold text-ink-2 px-2 py-2 border-b border-r border-black/10 min-w-[150px] max-w-[190px]">อลู (หน้าตัด)</th>
                      {colors.map((c) => (
                        <th key={c} title={c} className="sticky top-0 z-20 bg-white font-semibold text-ink-2 px-1.5 py-2 border-b border-black/10 text-center whitespace-nowrap min-w-[52px]">
                          {COLOR_SHORT[c] ?? c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sections.map((sec) => (
                      <SectionRows key={sec.key} label={sec.label} rows={sec.rows} colors={colors} canWrite={canWrite} onEdit={setEdit} />
                    ))}
                  </tbody>
                </table>
              </div>
              </>
            )}

      {edit && <EditQty item={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); qc.invalidateQueries({ queryKey: ["alu-pick-items"] }); qc.invalidateQueries({ queryKey: ["alu-ledger"] }); }} />}
    </div>
  );
}

/** มือถือ: 1 การ์ด = 1 หน้าตัด · ชิปสีละช่อง (3 ช่องต่อแถว) กดแก้จำนวน · สีที่ไม่มี = ชิปเทาจาง */
function ProfileCard({ p, canWrite, onEdit }: { p: Profile; canWrite: boolean; onEdit: (it: PickableItem) => void }) {
  const present = [...p.byColor.entries()].sort((a, b) => colorRank(a[0]) - colorRank(b[0]) || a[0].localeCompare(b[0]));
  const total = present.reduce((s, [, it]) => s + Math.max(0, it.qty), 0);
  return (
    <div className="rounded-2xl bg-white shadow-sm p-3">
      <div className="flex items-center gap-2.5">
        <Thumb url={p.image_url} size={48} />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="text-[15px] font-bold text-ink">{p.code ? `${p.code} ` : ""}{p.base}</div>
          <div className="text-[12px] text-ink-3">{present.length} สี · รวม <b className={total > 0 ? "text-ink-2" : "text-red-500"}>{fmtQty(total)}</b> เส้น</div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1.5 mt-2">
        {present.map(([c, it]) => {
          const zero = !(it.qty > 0);
          const low = !zero && it.min_qty > 0 && it.qty <= it.min_qty;
          const num = zero ? "text-red-500" : low ? "text-amber-600" : "text-ink";
          const inner = (
            <>
              <span className="block text-[11.5px] text-ink-3 truncate">{COLOR_SHORT[c] ?? c}</span>
              <span className={`block text-[18px] font-bold leading-tight tabular-nums ${num}`}>{fmtQty(it.qty)}</span>
            </>
          );
          return canWrite
            ? <button key={c} onClick={() => onEdit(it)} className="press min-h-[52px] rounded-xl bg-gray-50 border border-black/5 px-2 py-1 text-center">{inner}</button>
            : <div key={c} className="min-h-[52px] rounded-xl bg-gray-50 border border-black/5 px-2 py-1 text-center">{inner}</div>;
        })}
      </div>
    </div>
  );
}

function SectionRows({ label, rows, colors, canWrite, onEdit }: {
  label: string; rows: Profile[]; colors: string[]; canWrite: boolean; onEdit: (it: PickableItem) => void;
}) {
  return (
    <>
      {/* หัวประเภท — ติดซ้ายเวลาเลื่อนข้าง */}
      <tr>
        <td colSpan={colors.length + 1} className="bg-rose-50 border-b border-black/10 p-0">
          <div className="sticky left-0 inline-block px-2 py-1.5 text-[13px] font-bold text-brand-dark">{label} <span className="font-normal text-ink-3">({rows.length})</span></div>
        </td>
      </tr>
      {rows.map((p) => (
        <tr key={p.pkey}>
          <td className="sticky left-0 z-10 bg-white px-2 py-1.5 border-b border-r border-black/10 align-middle min-w-[150px] max-w-[190px]">
            <div className="flex items-center gap-2 min-w-0">
              <Thumb url={p.image_url} size={40} />
              <div className="min-w-0 leading-tight">
                {p.code && <div className="text-[12px] font-bold text-ink">{p.code}</div>}
                <div className="text-[12px] text-ink-2 break-words" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.base}</div>
              </div>
            </div>
          </td>
          {colors.map((c) => {
            const it = p.byColor.get(c);
            if (!it) return <td key={c} className="border-b border-black/5 bg-gray-200/80" aria-label={`ไม่มีสี ${c}`} />;
            const zero = !(it.qty > 0);
            const low = !zero && it.min_qty > 0 && it.qty <= it.min_qty;
            const cls = `w-full h-full min-h-[44px] px-1.5 text-center text-[14px] font-bold ${zero ? "text-red-500" : low ? "text-amber-600" : "text-ink"}`;
            return (
              <td key={c} className="border-b border-black/5 p-0 text-center align-middle">
                {canWrite
                  ? <button onClick={() => onEdit(it)} className={`${cls} hover:bg-brand/5`} title={`${p.code || p.base} ${c} — กดแก้จำนวน`}>{fmtQty(it.qty)}</button>
                  : <div className={`${cls} flex items-center justify-center`}>{fmtQty(it.qty)}</div>}
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}

/** แก้จำนวน = ปรับยอดให้ตรงที่นับได้ (ลงสมุดสโตร์) · popup ผ่าน portal (การ์ดแก้วมี backdrop-filter ทำ position:fixed เพี้ยน) */
function EditQty({ item, onClose, onSaved }: { item: PickableItem; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState(String(item.qty));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const n = Number(v);
  const valid = v.trim() !== "" && Number.isFinite(n) && n >= 0;
  async function save() {
    if (!valid) { setErr("ใส่จำนวน 0 ขึ้นไป"); return; }
    if (n === item.qty) { onClose(); return; }
    setBusy(true); setErr("");
    try {
      await api.post(`/stock/${item.id}/move`, {
        type: "adjust", qty: n, ref: "แก้ในตารางสรุปสโตร์อลู",
        note: `เดิม ${fmtQty(item.qty)} → ${fmtQty(n)}${reason.trim() ? " · " + reason.trim() : ""}`,
      });
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); setBusy(false); }
  }
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/40 p-3" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-3">
          <Thumb url={item.image_url} size={48} />
          <div className="min-w-0">
            <div className="font-bold text-ink leading-tight">{item.name}</div>
            <div className="text-xs text-ink-3">{item.sku} · ตอนนี้ {fmtQty(item.qty)} {item.unit}</div>
          </div>
        </div>
        <label className="block text-sm font-medium text-ink-2 mb-1">จำนวนที่นับได้จริง</label>
        <div className="flex items-center gap-2">
          <button onClick={() => setV(String(Math.max(0, (Number(v) || 0) - 1)))} className="min-h-[48px] min-w-[48px] rounded-xl bg-gray-100 text-2xl font-bold">−</button>
          <input autoFocus inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") save(); }}
            className="flex-1 min-h-[48px] rounded-xl border border-black/15 text-center text-2xl font-bold outline-none" />
          <button onClick={() => setV(String((Number(v) || 0) + 1))} className="min-h-[48px] min-w-[48px] rounded-xl bg-brand text-white text-2xl font-bold">+</button>
        </div>
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เหตุผล (ไม่บังคับ) เช่น นับใหม่ / เส้นหัก"
          className="w-full mt-2 min-h-[44px] rounded-xl border border-black/10 px-3 text-sm outline-none" />
        {valid && n !== item.qty && <p className="text-xs text-ink-3 mt-2">ปรับจาก {fmtQty(item.qty)} เป็น {fmtQty(n)} ({n > item.qty ? "+" : ""}{fmtQty(n - item.qty)}) · ลงสมุดสโตร์</p>}
        {err && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2 mt-2">{err}</p>}
        <div className="flex gap-2 mt-3">
          <button onClick={save} disabled={busy || !valid} className="flex-1 min-h-[48px] rounded-xl bg-brand text-white font-semibold disabled:opacity-50">{busy ? "กำลังบันทึก…" : "บันทึก"}</button>
          <button onClick={onClose} className="min-h-[48px] px-5 rounded-xl bg-gray-100 text-ink-2">ยกเลิก</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Chip({ on, dark, onClick, children }: { on: boolean; dark?: boolean; onClick: () => void; children: React.ReactNode }) {
  const onCls = dark ? "bg-ink text-white" : "bg-brand text-white";
  return (
    <button onClick={onClick} className={`press shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 min-h-[36px] text-[13px] font-semibold ${on ? onCls : "glass-soft text-ink-2"}`}>{children}</button>
  );
}
