"use client";

import { useEffect, useRef, useState } from "react";
import { Card, Badge } from "@/components/ui";
import Icon from "@/components/Icon";
import { baht } from "@/lib/money";
import { createClient } from "@/lib/supabase/client";
import type { StockItem, StockMove, StockMoveType, StockCategory, StockPrice } from "@/lib/types";
import { calcLink, isAluCode } from "@/lib/calculator40/stock-link";
import { isInCutlist } from "@/lib/cutlist/codes";
import { colorFromName } from "@/lib/cutlist/stock-match";
import ImageZoom from "@/components/ImageZoom";
import JobPicker, { type StockJob } from "@/components/stock/JobPicker";
import MergePanel from "@/components/stock/MergePanel";
import MergeHistory from "@/components/stock/MergeHistory";

const MOVE_LABEL: Record<StockMoveType, string> = { in: "รับเข้า", out: "จ่ายออก", adjust: "ปรับยอด" };
const MOVE_TONE: Record<StockMoveType, "emerald" | "red" | "amber"> = { in: "emerald", out: "red", adjust: "amber" };
const isLow = (it: StockItem) => Number(it.qty_on_hand) <= Number(it.min_qty);
// น้ำหนักเก็บ 3 ตำแหน่ง — baht() ปัดเหลือ 2 ทำให้เลขที่โชว์ไม่ตรงที่บันทึก
const fmt3 = (n: number) => Number(n || 0).toLocaleString("th-TH", { maximumFractionDigits: 3 });

// ── อัปโหลดรูปเข้า Supabase Storage (bucket 'stock') → คืน public URL ──
async function uploadImage(file: File): Promise<string> {
  const supabase = createClient();
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("stock").upload(path, file, { upsert: false, contentType: file.type });
  if (error) throw new Error(error.message);
  return supabase.storage.from("stock").getPublicUrl(path).data.publicUrl;
}

type JobHit = StockJob;

export default function StockClient({
  initial, categories: catsInit, canWrite, canAddItem = false, canPrice, canViewCost, isAdmin, canMerge = false,
}: {
  initial: StockItem[]; categories: StockCategory[]; canWrite: boolean; canAddItem?: boolean; canPrice: boolean; canViewCost: boolean; isAdmin: boolean; canMerge?: boolean;
}) {
  const [list, setList] = useState<StockItem[]>(initial);
  const [cats, setCats] = useState<StockCategory[]>(catsInit);
  const [sel, setSel] = useState<StockItem | null>(initial[0] ?? null);
  const [moves, setMoves] = useState<StockMove[]>([]);
  const [prices, setPrices] = useState<StockPrice[]>([]);
  const [q, setQ] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [calcOnly, setCalcOnly] = useState(false);
  const [boqOnly, setBoqOnly] = useState(false);
  const [dupOnly, setDupOnly] = useState(false);
  const [catFilter, setCatFilter] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [manageCat, setManageCat] = useState(false);
  const [merging, setMerging] = useState(false);
  const [mergeHist, setMergeHist] = useState(false);
  const reqRef = useRef(0); // กัน stale response ทับ state เมื่อคลิกสลับเร็วๆ

  // "น่าจะซ้ำ" = สต็อก 0 แต่ผูกใบตัด/คิดราคาอยู่ (มักเป็นตัวที่สร้างมาเพื่อคิดราคา/ใบตัด ทั้งที่มีของจริงอีกแถว)
  const isDupHint = (c: StockItem) => Number(c.qty_on_hand) === 0 && (calcLink(c).linked || isInCutlist(c.sku));
  const lowCount = list.filter(isLow).length;
  const calcCount = list.filter((c) => calcLink(c).linked).length;
  const boqCount = list.filter((c) => isInCutlist(c.sku)).length;
  const dupCount = list.filter(isDupHint).length;
  const filtered = list
    .filter((c) => (lowOnly ? isLow(c) : true))
    .filter((c) => (calcOnly ? calcLink(c).linked : true))
    .filter((c) => (boqOnly ? isInCutlist(c.sku) : true))
    .filter((c) => (dupOnly ? isDupHint(c) : true))
    .filter((c) => (catFilter ? c.category_id === catFilter : true))
    .filter((c) => [c.name, c.sku, c.category].join(" ").toLowerCase().includes(q.toLowerCase()));

  // หลังรวมรายการซ้ำ: เอาตัวที่ลบออกจากลิสต์ + โหลดตัวหลักใหม่ (ชื่อ/รหัส/ราคาอาจเปลี่ยน)
  function afterMerge(removedIds: number[], keepId: number) {
    setMerging(false);
    setList((l) => l.filter((x) => !removedIds.includes(x.id)));
    const keepRow = list.find((x) => x.id === keepId);
    if (keepRow) selectItem(keepRow);
  }
  // นับจำนวนต่อหมวด (โชว์บนปุ่มกรอง)
  const catCount = (id: number) => list.filter((c) => c.category_id === id).length;

  // ส่งออก CSV อลูฯ (ใบนับสต๊อก) — สโตร์กรอก "จำนวนนับใหม่" แล้วส่งกลับมาอัปเดต
  //   อลู = หมวดมี "อลู" / คิดต่อโล (is_weight_based) / รหัสขึ้นต้น B/F · id ไว้แมตช์ตอนอัปเดตกลับ
  function exportAluCsv() {
    const isAlu = (c: StockItem) => /อลู/.test(c.category || "") || !!c.is_weight_based || /^[BF]\d/.test(c.sku || "");
    const rows = list.filter(isAlu).sort((a, b) => (a.name || "").localeCompare(b.name || "", "th"));
    const esc = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const header = ["id", "รหัส", "ชื่อ", "หมวด", "ร้าน", "คงเหลือในระบบ", "หน่วย", "จำนวนนับใหม่"];
    const lines = [header.join(",")];
    for (const c of rows) lines.push([c.id, c.sku, c.name, c.category, c.supplier, c.qty_on_hand, c.unit, ""].map(esc).join(","));
    const csv = "﻿" + lines.join("\r\n"); // BOM ให้ Excel อ่านไทยถูก
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `stock-alu-count-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    alert(`ส่งออกอลูฯ ${rows.length} รายการแล้ว\nไฟล์: ${a.download}\nดูในโฟลเดอร์ Downloads`);
  }

  async function refreshCats() {
    const r = await fetch("/api/stock/categories");
    const j = await r.json().catch(() => null);
    if (r.ok) setCats((j?.data ?? []) as StockCategory[]);
  }

  async function selectItem(it: StockItem) {
    setSel(it); setAdding(false);
    const my = ++reqRef.current;
    const res = await fetch(`/api/stock/${it.id}`);
    const json = await res.json();
    if (my !== reqRef.current) return; // มีการเลือกใหม่แล้ว — ทิ้งผลเก่า
    if (res.ok) {
      setMoves((json.data?.stock_moves ?? []) as StockMove[]);
      setPrices((json.data?.stock_prices ?? []) as StockPrice[]);
      const fresh = json.data as StockItem;
      setSel(fresh);
      setList((l) => l.map((x) => (x.id === fresh.id ? fresh : x)));
    } else { setMoves([]); setPrices([]); }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-brand-dark flex items-center gap-2.5">
          <span className="text-white rounded-xl w-9 h-9 inline-flex items-center justify-center bg-brand shadow-brand">
            <Icon name="boxes" size={18} />
          </span>
          เช็คสต๊อกวัสดุ
        </h1>
        <div className="flex items-center gap-2">
          <a href="/stock/moves" className="press inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-brand-dark border border-brand/30 bg-white/60">
            <Icon name="calendar" size={16} /> สมุดเคลื่อนไหว
          </a>
          {canWrite && (
            <button onClick={exportAluCsv} title="ส่งออกอลูฯ ทั้งหมดเป็น CSV (มีช่องจำนวนนับใหม่ให้สโตร์กรอก)"
              className="press inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-brand-dark border border-brand/30 bg-white/60">
              ⬇️ ส่งออกอลู (นับสต๊อก)
            </button>
          )}
          {canWrite && (
            <a href="/stock/count-import" title="อัปโหลด CSV นับสต็อก → พรีวิว → ตั้งจำนวนตามที่นับ"
              className="press inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-emerald-600 shadow-sm">
              ⬆️ นำเข้านับสต็อก
            </a>
          )}
          {canPrice && (
            <a href="/stock/alu-rates" className="press inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-brand-dark border border-brand/30 bg-white/60">
              ⚖️ เรตอลูต่อโล
            </a>
          )}
          {/* เติมน้ำหนัก/เส้น จากไฟล์ถอดทุน — ไม่มีน้ำหนัก = เปลี่ยนเรตต่อโลแล้วราคาไม่ขยับ */}
          {canPrice && (
            <a href="/stock/weight-backfill" className="press inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-brand-dark border border-brand/30 bg-white/60">
              ⚖️ เติมน้ำหนักเส้นอลู
            </a>
          )}
          {canWrite && (
            <a href="/stock/import" className="press inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-brand-dark border border-brand/30 bg-white/60">
              <Icon name="file" size={16} /> นำเข้าจากไฟล์
            </a>
          )}
          {canAddItem && (
            <button onClick={() => { setAdding(true); setSel(null); }} className="press inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-brand shadow-brand">
              <Icon name="plus" size={16} /> เพิ่มวัสดุใหม่
            </button>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* ── ซ้าย: ค้นหา + ตัวกรอง + รายการ ── */}
        <Card className="p-4 lg:col-span-1">
          <label className="relative block mb-3">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"><Icon name="search" size={16} /></span>
            <input aria-label="ค้นหาวัสดุ" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหา ชื่อ / SKU / หมวด"
              className="w-full glass-soft rounded-xl pl-9 pr-3 py-2.5 text-sm outline-none" />
          </label>
          {/* กรองตามหมวด (dropdown) */}
          <select value={catFilter ?? ""} onChange={(e) => setCatFilter(e.target.value ? Number(e.target.value) : null)}
            aria-label="กรองตามหมวด"
            className="w-full glass-soft rounded-xl px-3 py-2.5 text-sm outline-none mb-2">
            <option value="">ทุกหมวด ({list.length})</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>{c.name}{catCount(c.id) > 0 ? ` (${catCount(c.id)})` : ""}</option>
            ))}
          </select>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <button onClick={() => setLowOnly((v) => !v)}
              className={`press text-xs font-semibold rounded-full px-3 py-1.5 ${lowOnly ? "bg-red-600 text-white" : "glass-soft text-ink-2"}`}>
              ต้องสั่งซื้อ {lowCount > 0 ? `(${lowCount})` : ""}
            </button>
            <button onClick={() => setCalcOnly((v) => !v)} title="วัสดุที่ราคาลิงค์กับคิดราคา 4.0"
              className={`press text-xs font-semibold rounded-full px-3 py-1.5 ${calcOnly ? "bg-brand text-white" : "glass-soft text-ink-2"}`}>
              🧮 ใช้ในคิดราคา {calcCount > 0 ? `(${calcCount})` : ""}
            </button>
            <button onClick={() => setBoqOnly((v) => !v)} title="วัสดุที่ถูกใช้ในใบตัด/ถอด BOQ (หักสต็อกตอนตัด)"
              className={`press text-xs font-semibold rounded-full px-3 py-1.5 ${boqOnly ? "bg-emerald-600 text-white" : "glass-soft text-ink-2"}`}>
              ✂️ ใช้ในใบตัด {boqCount > 0 ? `(${boqCount})` : ""}
            </button>
            {canMerge && (
              <button onClick={() => setDupOnly((v) => !v)} title="สต็อก 0 แต่ผูกใบตัด/คิดราคา — น่าจะเป็นตัวซ้ำที่ควรยุบรวม"
                className={`press text-xs font-semibold rounded-full px-3 py-1.5 ${dupOnly ? "bg-amber-500 text-white" : "glass-soft text-ink-2"}`}>
                🔀 น่าจะซ้ำ {dupCount > 0 ? `(${dupCount})` : ""}
              </button>
            )}
            {isAdmin && (
              <button onClick={() => setMergeHist(true)} title="ดูประวัติการรวมรายการซ้ำย้อนหลัง (ใคร/รวมอะไร/เมื่อไหร่)"
                className="press text-xs font-semibold rounded-full px-3 py-1.5 glass-soft text-ink-2">
                🕘 ประวัติการรวม
              </button>
            )}
            {(lowOnly || calcOnly || boqOnly || dupOnly || catFilter !== null) && <button onClick={() => { setLowOnly(false); setCalcOnly(false); setBoqOnly(false); setDupOnly(false); setCatFilter(null); }} className="text-xs text-ink-3">ล้างตัวกรอง</button>}
          </div>
          <div className="space-y-2 max-h-[62vh] overflow-y-auto">
            {filtered.map((c) => {
              const low = isLow(c); const active = sel?.id === c.id;
              return (
                <button key={c.id} onClick={() => selectItem(c)} aria-current={active}
                  className={`press w-full text-left rounded-xl px-3 py-2.5 flex items-center gap-3 ${active ? "text-white bg-brand shadow-brand" : "glass-soft hover:bg-white/70"}`}>
                  <Thumb url={c.image_url} active={active} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold text-sm truncate flex items-center gap-1">
                        {calcLink(c).linked && <span title="ราคาลิงค์กับคิดราคา 4.0" className="shrink-0">🧮</span>}
                        {isInCutlist(c.sku) && <span title="ใช้ในใบตัด/ถอด BOQ (หักสต็อกตอนตัด)" className="shrink-0">✂️</span>}
                        <span className="truncate">{c.name}</span>
                      </div>
                      {low && (active
                        ? <span className="text-xs font-semibold bg-white/25 rounded-full px-2 py-0.5 shrink-0">ใกล้หมด</span>
                        : <Badge tone="red" dot>ใกล้หมด</Badge>)}
                    </div>
                    <div className={`text-xs mt-0.5 truncate ${active ? "text-red-50" : "text-ink-3"}`}>
                      คงเหลือ {baht(c.qty_on_hand)} {c.unit || ""}{c.category ? ` · ${c.category}` : ""}
                    </div>
                  </div>
                </button>
              );
            })}
            {filtered.length === 0 && <p className="text-sm text-ink-3 text-center py-4">ไม่พบวัสดุ</p>}
          </div>
        </Card>

        {/* ── ขวา: ฟอร์มเพิ่ม / รายละเอียด ── */}
        <Card className="p-6 lg:col-span-2">
          {adding ? (
            <AddItemForm
              cats={cats} canViewCost={canViewCost} onManageCat={() => setManageCat(true)}
              onCancel={() => setAdding(false)}
              onSaved={(it) => { setList([it, ...list]); setSel(it); setMoves([]); setPrices([]); setAdding(false); }}
            />
          ) : sel ? (
            <ItemDetail
              key={sel.id} item={sel} moves={moves} prices={prices} cats={cats}
              canWrite={canWrite} canPrice={canPrice} canViewCost={canViewCost} isAdmin={isAdmin} canMerge={canMerge}
              onManageCat={() => setManageCat(true)}
              onOpenMerge={() => setMerging(true)}
              onChanged={() => selectItem(sel)}
              onItemPatched={(it) => { setSel(it); setList((l) => l.map((x) => x.id === it.id ? it : x)); }}
              onDeleted={(id) => { setList((l) => l.filter((x) => x.id !== id)); setSel(null); setMoves([]); setPrices([]); }}
            />
          ) : (
            <p className="text-ink-3 text-center py-10">เลือกวัสดุทางซ้าย หรือเพิ่มใหม่</p>
          )}
        </Card>
      </div>

      {manageCat && (
        <CategoryManager cats={cats} onClose={() => setManageCat(false)} onChanged={refreshCats} />
      )}
      {merging && sel && (
        <MergePanel keepItem={sel} canViewCost={canViewCost} canSetQty={canPrice} onClose={() => setMerging(false)} onMerged={afterMerge} />
      )}
      {mergeHist && <MergeHistory onClose={() => setMergeHist(false)} />}
    </div>
  );
}

// ── รูปย่อ ──
function Thumb({ url, active, size = 40 }: { url: string; active?: boolean; size?: number }) {
  if (!url) return (
    <span className={`shrink-0 rounded-lg inline-flex items-center justify-center ${active ? "bg-white/20" : "bg-black/5 text-ink-3"}`} style={{ width: size, height: size }}>
      <Icon name="boxes" size={Math.round(size * 0.5)} />
    </span>
  );
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className="shrink-0 rounded-lg object-cover bg-black/5" style={{ width: size, height: size }} />;
}

// ── รายละเอียดวัสดุ + เคลื่อนไหว + ต้นทุน/ราคา ──
function ItemDetail({
  item, moves, prices, cats, canWrite, canPrice, canViewCost, isAdmin, canMerge, onManageCat, onOpenMerge, onChanged, onItemPatched, onDeleted,
}: {
  item: StockItem; moves: StockMove[]; prices: StockPrice[]; cats: StockCategory[];
  canWrite: boolean; canPrice: boolean; canViewCost: boolean; isAdmin: boolean; canMerge: boolean; onManageCat: () => void; onOpenMerge: () => void; onChanged: () => void;
  onItemPatched: (it: StockItem) => void; onDeleted: (id: number) => void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [voidBusy, setVoidBusy] = useState<number | null>(null);
  const [editMove, setEditMove] = useState<StockMove | null>(null);

  async function voidMove(m: StockMove) {
    const reason = window.prompt(`ยกเลิกรายการ ${MOVE_LABEL[m.type]} ${baht(m.qty)} ${item.unit}?\n(ยอด/ต้นทุนจะถูกคิดใหม่ · เก็บไว้ในประวัติ)\n\nเหตุผล:`);
    if (!reason || !reason.trim()) return;
    setVoidBusy(m.id);
    try {
      const r = await fetch(`/api/stock/moves/${m.id}/void`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) });
      if (r.ok) onChanged();
      else alert((await r.json().catch(() => null))?.error ?? "ยกเลิกไม่สำเร็จ");
    } finally { setVoidBusy(null); }
  }

  async function delItem() {
    if (!confirm(`ลบ "${item.name}" ถาวร?\nประวัติรับเข้า/เบิกออก/ราคาของวัสดุนี้จะถูกลบตามไปด้วย — กู้คืนไม่ได้`)) return;
    setDeleting(true);
    const res = await fetch(`/api/stock/${item.id}`, { method: "DELETE" });
    setDeleting(false);
    if (res.ok) onDeleted(item.id);
    else { const j = await res.json().catch(() => null); alert(j?.error ?? "ลบไม่สำเร็จ"); }
  }
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <ImageZoom src={item.image_url} alt={item.name} title="ดูรูปสินค้าใหญ่" className="shrink-0 inline-flex cursor-zoom-in">
            <Thumb url={item.image_url} size={56} />
          </ImageZoom>
          <div className="min-w-0">
            {/* ชื่อ + สี — โชว์สีครั้งเดียว: ถ้าชื่อมีสีอยู่แล้วใช้ชื่อตามเดิม · ถ้าไม่มีแต่ช่องสีตั้งไว้ ต่อสีท้ายชื่อ (กันซ้ำ) */}
            <h3 className="text-lg font-bold text-brand-dark truncate">
              {colorFromName(item.name, item.sku) || !item.color ? item.name : `${item.name} ${item.color}`}
            </h3>
            <p className="text-sm text-ink-3 truncate">
              {item.category || "—"}{item.sku ? ` · ${item.sku}` : ""}{item.supplier ? ` · ร้าน ${item.supplier}` : ""}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {calcLink(item).linked && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-dark bg-brand/10 rounded-full px-2 py-0.5">
                  🧮 ใช้ในคิดราคา 4.0 · หมวด {calcLink(item).section}
                </span>
              )}
              {isInCutlist(item.sku) && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-100 rounded-full px-2 py-0.5">
                  ✂️ ใช้ในใบตัด/ถอด BOQ (หักสต็อกตอนตัด)
                </span>
              )}
            </div>
          </div>
        </div>
        {isLow(item) ? <Badge tone="red" dot>สั่งเพิ่ม</Badge> : <Badge tone="emerald" dot>ปกติ</Badge>}
      </div>

      {item.image_url && (
        <ImageZoom src={item.image_url} alt={item.name} title="ดูรูปสินค้าใหญ่" className="text-xs text-brand font-semibold inline-flex items-center gap-1 mt-2">
          <Icon name="search" size={12} /> ดูรูปเต็ม
        </ImageZoom>
      )}

      {/* คงเหลือ + ต้นทุน (ต้นทุนโชว์เฉพาะคนที่เห็นราคาได้) */}
      <div className={`mt-4 grid gap-3 ${canViewCost ? "grid-cols-2" : "grid-cols-1"}`}>
        <div className={`rounded-2xl px-5 py-4 ${isLow(item) ? "bg-red-50" : "glass-soft"}`}>
          <div className="text-xs font-medium text-ink-3">คงเหลือในคลัง</div>
          <div className={`text-3xl font-bold leading-tight ${isLow(item) ? "text-red-700" : "text-brand-dark"}`}>
            {baht(item.qty_on_hand)} <span className="text-base font-semibold text-ink-3">{item.unit}</span>
          </div>
          <div className="text-xs text-ink-3 mt-1">จุดเตือนขั้นต่ำ {baht(item.min_qty)} {item.unit}</div>
        </div>
        {canViewCost && (
          <div className="rounded-2xl px-5 py-4 glass-soft">
            <div className="text-xs font-medium text-ink-3">ต้นทุน/หน่วย</div>
            <div className="text-3xl font-bold leading-tight text-brand-dark">฿{baht(item.unit_cost)}</div>
            {/* บอกให้ชัดว่าตัวนี้คิดยังไง — ต่อโล หรือตั้งราคาต่อหน่วยตรง (เจ้าของสั่ง 19 ส.ค.69) */}
            {item.is_weight_based ? (
              <div className="text-xs mt-1.5">
                <span className="inline-flex items-center rounded-full px-2 py-0.5 font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                  คิดต่อโล
                </span>
                <span className="text-ink-3 ml-2">
                  {baht(item.price_per_kg)} ฿/กก. × {fmt3(item.weight_per_unit)} กก./{item.unit}
                </span>
                <div className="text-ink-3 mt-1">เปลี่ยนเรตต่อโลเมื่อไร ราคาต่อ{item.unit}คิดใหม่ให้เอง</div>
              </div>
            ) : (
              <div className="text-xs mt-1.5">
                <span className="inline-flex items-center rounded-full px-2 py-0.5 font-semibold bg-line/40 text-ink-2 border border-line">
                  ตั้งราคาต่อ{item.unit}ตรง
                </span>
                <div className="text-ink-3 mt-1">
                  ตัวนี้ยังไม่ได้คิดต่อโล — แก้ราคาต้องพิมพ์ราคาต่อ{item.unit}เอง
                  {Number(item.weight_per_unit) > 0
                    ? ` (มีน้ำหนัก ${fmt3(item.weight_per_unit)} กก. แล้ว เปลี่ยนเป็นคิดต่อโลได้เลย)`
                    : ` (ยังไม่มีน้ำหนักต่อ${item.unit} ต้องใส่น้ำหนักก่อนถึงจะคิดต่อโลได้)`}
                </div>
              </div>
            )}
            <div className="text-xs text-ink-3 mt-0.5">มูลค่าคงคลัง ≈ ฿{baht(Number(item.qty_on_hand) * Number(item.unit_cost))}</div>
          </div>
        )}
      </div>

      {canWrite && <MoveForm item={item} canViewCost={canViewCost} onDone={onChanged} />}

      {/* ต้นทุน/ราคา — เฉพาะคนที่เห็นราคาได้ (ซ่อนจากฝ่ายสโตร์) */}
      {canViewCost && <PriceSection item={item} prices={prices} canPrice={canPrice} isAdmin={isAdmin} onDone={onChanged} />}

      {/* แก้ข้อมูลวัสดุ */}
      {canWrite && (
        <div className="mt-5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <button onClick={() => setEditOpen((v) => !v)} className="press text-sm text-brand-dark font-semibold inline-flex items-center gap-1.5">
              <Icon name="pencil" size={14} /> {editOpen ? "ปิดการแก้ไข" : "แก้ข้อมูลวัสดุ (ชื่อ/หมวด/หน่วย/รูป/น้ำหนัก)"}
            </button>
            <div className="flex items-center gap-3">
              {canMerge && (
                <button onClick={onOpenMerge}
                  className="press text-sm text-amber-600 hover:text-amber-700 font-semibold inline-flex items-center gap-1.5">
                  🔀 รวมรายการซ้ำเข้าตัวนี้
                </button>
              )}
              {/* ลบวัสดุ = แอดมินเท่านั้น (API ADMIN-only อยู่แล้ว · ซ่อนปุ่มให้ตรง — มิ้ง/สโตร์ลบไม่ได้) */}
              {isAdmin && (
                <button onClick={delItem} disabled={deleting}
                  className="press text-sm text-red-600 hover:text-red-700 font-semibold inline-flex items-center gap-1.5 disabled:opacity-60">
                  <Icon name="trash" size={14} /> {deleting ? "กำลังลบ…" : "ลบวัสดุนี้"}
                </button>
              )}
            </div>
          </div>
          {editOpen && (
            <EditItemForm item={item} cats={cats} canViewCost={canViewCost} onManageCat={onManageCat}
              onSaved={(it) => { onItemPatched(it); setEditOpen(false); }} />
          )}
        </div>
      )}

      {/* ประวัติเคลื่อนไหว */}
      <div className="mt-6">
        <div className="text-sm font-semibold text-brand-dark mb-2">ประวัติความเคลื่อนไหวล่าสุด</div>
        {moves.length === 0 ? (
          <p className="text-sm text-ink-3 glass-soft rounded-xl px-3 py-3">ยังไม่มีการเคลื่อนไหว</p>
        ) : (
          <div className="overflow-x-auto glass-soft rounded-xl">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ink-3 text-xs border-b border-black/5">
                  <th className="px-3 py-2 font-medium">วันที่</th>
                  <th className="px-3 py-2 font-medium">ประเภท</th>
                  <th className="px-3 py-2 font-medium text-right">จำนวน</th>
                  <th className="px-3 py-2 font-medium">ผู้เบิก/อ้างอิง</th>
                  <th className="px-3 py-2 font-medium">รูป</th>
                  {canWrite && <th className="px-3 py-2 font-medium text-right">จัดการ</th>}
                </tr>
              </thead>
              <tbody>
                {moves.map((m) => (
                  <tr key={m.id} className={`border-b border-black/5 last:border-0 ${m.is_voided ? "opacity-50" : ""}`}>
                    <td className="px-3 py-2 text-ink-2 whitespace-nowrap">{new Date(m.created_at).toLocaleDateString("th-TH")}</td>
                    <td className="px-3 py-2">
                      <Badge tone={MOVE_TONE[m.type]}>{MOVE_LABEL[m.type]}</Badge>
                      {m.is_voided && <span className="ml-1 text-[10px] text-red-600 font-semibold">ยกเลิก</span>}
                      {!m.is_voided && m.edited_at && <span className="ml-1 text-[10px] text-amber-600">แก้แล้ว</span>}
                    </td>
                    <td className={`px-3 py-2 text-right font-semibold tabular-nums ${m.is_voided ? "line-through" : ""}`}>
                      {m.type === "out" ? "−" : m.type === "in" ? "+" : "="}{baht(m.qty)}
                    </td>
                    <td className="px-3 py-2 text-ink-2 truncate max-w-[160px]">
                      {m.requester || m.ref || "—"}
                      {canViewCost && m.total_price ? <span className="text-ink-3"> · ฿{baht(m.total_price)}</span> : ""}
                      {m.is_voided && m.void_reason && <div className="text-[10px] text-red-500">เหตุผล: {m.void_reason}</div>}
                    </td>
                    <td className="px-3 py-2">
                      {m.image_url
                        ? <ImageZoom src={m.image_url} title="ดูรูปใหญ่" className="text-brand inline-flex cursor-zoom-in"><Icon name="search" size={14} /></ImageZoom>
                        : <span className="text-ink-3">—</span>}
                    </td>
                    {canWrite && (
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {m.is_voided ? <span className="text-ink-3 text-xs">—</span> : (
                          <span className="inline-flex gap-1">
                            <button onClick={() => setEditMove(m)} title="แก้ไข" className="press text-ink-3 hover:text-brand-dark"><Icon name="pencil" size={14} /></button>
                            <button onClick={() => voidMove(m)} disabled={voidBusy === m.id} title="ยกเลิก" className="press text-ink-3 hover:text-red-600 disabled:opacity-50"><Icon name="close" size={15} /></button>
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {editMove && <MoveEditModal move={editMove} onClose={() => setEditMove(null)} onSaved={() => { setEditMove(null); onChanged(); }} />}
    </div>
  );
}

// ── แก้ข้อความรายการเคลื่อนไหว (ผู้เบิก/อ้างอิง/หมายเหตุ) — ไม่แตะจำนวน/ต้นทุน (กันยอดเพี้ยน) ──
// จำนวน/ประเภทผิด → ใช้ปุ่ม "ยกเลิก" แล้วลงใหม่
function MoveEditModal({ move, onClose, onSaved }: {
  move: StockMove; onClose: () => void; onSaved: () => void;
}) {
  const [requester, setRequester] = useState(move.requester || "");
  const [note, setNote] = useState(move.note || "");
  const [ref, setRef] = useState(move.ref || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    setBusy(true); setErr("");
    try {
      const r = await fetch(`/api/stock/moves/${move.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requester, note, ref }) });
      if (r.ok) onSaved();
      else setErr((await r.json().catch(() => null))?.error ?? "บันทึกไม่สำเร็จ");
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm bg-white rounded-2xl p-5 shadow-2xl space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-brand-dark">แก้ข้อความ — {MOVE_LABEL[move.type]} {baht(move.qty)}</h3>
          <button onClick={onClose} aria-label="ปิด" className="text-ink-3"><Icon name="close" size={18} /></button>
        </div>
        <p className="text-xs text-ink-3">แก้ได้เฉพาะข้อความ · <b>จำนวน/ประเภทผิด</b> ให้กด &quot;ยกเลิก (✕)&quot; แล้วลงรายการใหม่ (กันยอด/ต้นทุนเพี้ยน)</p>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Field label="ผู้เบิก/ผู้รับ" value={requester} onChange={setRequester} autoFocus wide />
          <Field label="อ้างอิง" value={ref} onChange={setRef} />
          <Field label="หมายเหตุ" value={note} onChange={setNote} />
        </div>
        {err && <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{err}</p>}
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} disabled={busy} className="press flex-1 border border-gray-200 rounded-xl py-2.5 text-sm">ยกเลิก</button>
          <button onClick={save} disabled={busy} className="press flex-1 bg-brand text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50">บันทึก</button>
        </div>
      </div>
    </div>
  );
}

// ── ฟอร์มบันทึกเคลื่อนไหว (รับเข้า/เบิกออก/ปรับยอด) ──
function MoveForm({ item, canViewCost, onDone }: { item: StockItem; canViewCost: boolean; onDone: () => void }) {
  const [type, setType] = useState<StockMoveType | null>(null);
  const [qty, setQty] = useState("");
  const [requester, setRequester] = useState("");
  const [job, setJob] = useState<JobHit | null>(null);
  const [ref, setRef] = useState("");
  const [note, setNote] = useState("");
  const [totalPrice, setTotalPrice] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [reqOpts, setReqOpts] = useState<string[]>([]); // รายชื่อผู้เบิก/รับเข้าเดิม (datalist)
  useEffect(() => {
    let alive = true;
    fetch("/api/stock/requesters").then((r) => r.json()).then((j) => { if (alive && Array.isArray(j?.data)) setReqOpts(j.data); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  function reset() { setQty(""); setRequester(""); setJob(null); setRef(""); setNote(""); setTotalPrice(""); setImageUrl(""); setErr(""); }

  async function submit() {
    if (!type) return;
    const n = Number(qty);
    if (!Number.isFinite(n) || n === 0) { setErr("ต้องระบุจำนวน"); return; }
    setBusy(true); setErr("");
    const body: Record<string, unknown> = {
      type, qty: n, ref, note, requester,
      job_id: job?.id ?? null, image_url: imageUrl,
    };
    if (type === "in" && totalPrice) body.total_price = Number(totalPrice) || 0;
    const res = await fetch(`/api/stock/${item.id}/move`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(json.error ?? "บันทึกไม่สำเร็จ"); return; }
    reset(); setType(null); onDone();
  }

  return (
    <div className="mt-5">
      {/* ปุ่มใหญ่ 2 ปุ่ม + ปรับยอด */}
      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => { setType(type === "in" ? null : "in"); reset(); }}
          className={`press rounded-2xl py-4 text-base font-bold border-2 ${type === "in" ? "bg-emerald-600 text-white border-emerald-600" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>
          ⬇ รับเข้า
        </button>
        <button onClick={() => { setType(type === "out" ? null : "out"); reset(); }}
          className={`press rounded-2xl py-4 text-base font-bold border-2 ${type === "out" ? "bg-red-600 text-white border-red-600" : "bg-red-50 text-red-700 border-red-200"}`}>
          ⬆ เบิกออก
        </button>
      </div>
      <button onClick={() => { setType(type === "adjust" ? null : "adjust"); reset(); }}
        className="press mt-2 text-xs text-ink-3 hover:text-ink-1">ปรับยอดคงเหลือ (นับสต๊อก) →</button>

      {type && (
        <div className="mt-3 rounded-2xl border border-brand/20 bg-brand/5 p-4 space-y-3">
          <div className="text-sm font-semibold text-brand-dark">
            {MOVE_LABEL[type]}{type === "adjust" ? " — ตั้งค่าคงเหลือใหม่" : ""}
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Field label={type === "adjust" ? `คงเหลือใหม่ (${item.unit})` : `จำนวน (${item.unit})`} value={qty} onChange={setQty} type="number" autoFocus />
            {type === "out" && <Field label="ผู้เบิก (ช่างที่มาเบิก)" value={requester} onChange={setRequester} placeholder="ชื่อช่างที่มาขอเบิก" list="stk-requesters" />}
            {type === "in" && canViewCost && <Field label="ราคาที่จ่ายจริง (บาท)" value={totalPrice} onChange={setTotalPrice} type="number" placeholder="รวมทั้งบิล ถ้ามี" />}
            {type === "in" && <Field label="ผู้รับเข้า" value={requester} onChange={setRequester} placeholder="เลือกหรือพิมพ์ชื่อ" list="stk-requesters" />}
          </div>
          <datalist id="stk-requesters">{reqOpts.map((n) => <option key={n} value={n} />)}</datalist>

          {/* ผูกงาน (เบิกออก) */}
          {type === "out" && <JobPicker value={job} onPick={setJob} />}

          <div className="grid grid-cols-2 gap-3 text-sm">
            {/* เบิกออก: ผูกลูกค้าด้วย "ผูกงาน" ด้านบนแล้ว ไม่ต้องมีช่องอ้างอิงซ้ำ · รับเข้า: อ้างอิง = เลข PO/ร้านค้า */}
            {type === "in" && <Field label="อ้างอิง (PO/ร้าน)" value={ref} onChange={setRef} />}
            <Field label="หมายเหตุ" value={note} onChange={setNote} />
          </div>

          {/* รูป (รับเข้า = รูปใบเสร็จ/ของ) */}
          <ImageField label={type === "in" ? "รูปใบเสร็จ/ของ (ถ้ามี)" : "รูป (ถ้ามี)"} url={imageUrl} onChange={setImageUrl} />

          {err && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{err}</p>}
          <div className="flex gap-2">
            <button onClick={submit} disabled={busy}
              className={`press rounded-xl px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60 ${type === "out" ? "bg-red-600" : type === "in" ? "bg-emerald-600" : "bg-amber-500"}`}>
              {busy ? "กำลังบันทึก…" : "บันทึก"}
            </button>
            <button onClick={() => { setType(null); reset(); }} className="press glass-soft rounded-xl px-5 py-2.5 text-sm text-ink-2">ยกเลิก</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** สลับ "คิดต่อโล ↔ ตั้งราคาต่อหน่วยตรง" — ราคาต่อหน่วยไม่ขยับ + ลงประวัติราคาให้ครบ */
function ModeSwitch({ item, onDone }: { item: StockItem; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const toWeight = !item.is_weight_based;
  const kg = Number(item.weight_per_unit) || 0;
  const blocked = toWeight && kg <= 0;   // ไม่มีน้ำหนัก = เปลี่ยนเป็นต่อโลไม่ได้ (ราคาจะกลายเป็น 0)

  async function go() {
    const msg = toWeight
      ? `เปลี่ยน "${item.name}" เป็นคิดต่อโล?\n\nเรตตั้งต้นคิดจากราคาปัจจุบัน ÷ ${kg} กก. → ราคาต่อ${item.unit}เท่าเดิม\nต่อไปแก้ที่ "เรตต่อโล" แล้วราคาต่อ${item.unit}คิดใหม่ให้เอง`
      : `เปลี่ยน "${item.name}" กลับเป็นตั้งราคาต่อ${item.unit}ตรง?\n\nราคาเท่าเดิม ต่อไปต้องพิมพ์ราคาต่อ${item.unit}เอง`;
    if (!confirm(msg)) return;
    setBusy(true);
    const res = await fetch(`/api/stock/${item.id}/pricing-mode`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weight_based: toWeight }),
    });
    const json = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) { alert(json?.error ?? "เปลี่ยนไม่สำเร็จ"); return; }
    onDone();
  }

  return (
    <button onClick={go} disabled={busy || blocked}
      title={blocked ? `ต้องใส่น้ำหนักต่อ${item.unit}ก่อน ถึงจะเปลี่ยนเป็นคิดต่อโลได้` : undefined}
      className="press text-xs font-semibold text-ink-2 glass-soft rounded-lg px-2.5 py-1.5 disabled:opacity-40">
      {busy ? "กำลังเปลี่ยน…" : toWeight ? "⚖️ เปลี่ยนเป็นคิดต่อโล" : `เปลี่ยนเป็นราคาต่อ${item.unit}ตรง`}
    </button>
  );
}

// ── ต้นทุน/ราคา + ประวัติราคา ──
function PriceSection({ item, prices, canPrice, isAdmin, onDone }: { item: StockItem; prices: StockPrice[]; canPrice: boolean; isAdmin: boolean; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [pricePerKg, setPricePerKg] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [supplier, setSupplier] = useState(item.supplier || "");
  const [effDate, setEffDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    setBusy(true); setErr("");
    const body: Record<string, unknown> = { effective_date: effDate, supplier, note };
    if (item.is_weight_based) body.price_per_kg = Number(pricePerKg) || 0;
    else body.unit_cost = Number(unitCost) || 0;
    const res = await fetch(`/api/stock/${item.id}/price`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(json.error ?? "บันทึกไม่สำเร็จ"); return; }
    setPricePerKg(""); setUnitCost(""); setNote(""); setOpen(false); onDone();
  }

  async function delPrice(pid: number) {
    if (!confirm("ลบราคานี้? ต้นทุนจะคำนวณใหม่จากราคาล่าสุดที่เหลือ")) return;
    const res = await fetch(`/api/stock/${item.id}/price/${pid}`, { method: "DELETE" });
    if (res.ok) onDone();
    else { const j = await res.json().catch(() => null); alert(j?.error ?? "ลบไม่ได้"); }
  }

  return (
    <div className="mt-5">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-brand-dark">ต้นทุน / ประวัติราคา</div>
        {canPrice && (
          <div className="flex gap-2">
            <ModeSwitch item={item} onDone={onDone} />
            <button onClick={() => setOpen((v) => !v)} className="press text-xs font-semibold text-brand-dark glass-soft rounded-lg px-2.5 py-1.5">
              + อัปเดตราคา
            </button>
          </div>
        )}
      </div>
      {calcLink(item).linked && (
        <p className="mt-2 text-[11px] text-brand-dark bg-brand/5 border border-brand/15 rounded-lg px-3 py-2">
          🧮 <b>ราคานี้ลิงค์กับคิดราคา 4.0</b> — แก้ราคาที่นี่แล้วใบเสนอราคา 4.0 คิดตามราคาใหม่ทันที
          {calcLink(item).section === "อลูมิเนียม" && (isAluCode(item.sku)
            ? " · ผูกรายเส้นด้วยรหัส " + (item.sku || "") + " — แก้ต้นทุน/หน่วยแล้วราคาเส้นนี้เปลี่ยนทุกรุ่นที่ใช้ (ถ้ามีหลายสี ระบบยึดแถวสีอบขาว)"
            : " · อลูคิดเป็น “เรตต่อโล/แบรนด์” (แก้เส้นไหนก็ปรับทั้งแบรนด์ " + (item.supplier || "") + " ในคิดราคา — ควรตั้งให้เท่ากันทั้งแบรนด์)")}
        </p>
      )}

      {open && canPrice && (
        <div className="mt-2 rounded-xl border border-brand/20 bg-brand/5 p-3 space-y-2.5">
          <div className="grid grid-cols-2 gap-3 text-sm">
            {item.is_weight_based
              ? <Field label="ราคาต่อโล (฿/กก.)" value={pricePerKg} onChange={setPricePerKg} type="number" autoFocus />
              : <Field label="ต้นทุนต่อหน่วย (฿)" value={unitCost} onChange={setUnitCost} type="number" autoFocus />}
            <Field label="มีผลวันที่" value={effDate} onChange={setEffDate} type="date" />
            {/* ร้าน/ผู้ขาย ใช้ค่าจากข้อมูลวัสดุ (supplier) — ไม่ต้องกรอกซ้ำ · ปรับที่ฟอร์มแก้วัสดุ */}
            <Field label="หมายเหตุ" value={note} onChange={setNote} />
          </div>
          {item.is_weight_based && pricePerKg && (
            <p className="text-xs text-ink-3">→ ต้นทุนต่อ {item.unit} ≈ ฿{baht((Number(pricePerKg) || 0) * Number(item.weight_per_unit))}</p>
          )}
          {err && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{err}</p>}
          <button onClick={save} disabled={busy} className="press rounded-xl px-4 py-2 text-sm font-semibold text-white bg-brand disabled:opacity-60">
            {busy ? "กำลังบันทึก…" : "บันทึกราคา"}
          </button>
        </div>
      )}

      <div className="mt-2">
        {prices.length === 0 ? (
          <p className="text-sm text-ink-3 glass-soft rounded-xl px-3 py-2.5">ยังไม่มีประวัติราคา</p>
        ) : (
          <div className="overflow-x-auto glass-soft rounded-xl">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ink-3 text-xs border-b border-black/5">
                  <th className="px-3 py-2 font-medium">วันที่</th>
                  {item.is_weight_based && <th className="px-3 py-2 font-medium text-right">฿/กก.</th>}
                  <th className="px-3 py-2 font-medium text-right">ต้นทุน/{item.unit}</th>
                  {isAdmin && <th className="px-3 py-2"></th>}
                </tr>
              </thead>
              <tbody>
                {prices.map((p) => (
                  <tr key={p.id} className="border-b border-black/5 last:border-0">
                    <td className="px-3 py-2 text-ink-2 whitespace-nowrap">{new Date(p.effective_date).toLocaleDateString("th-TH")}</td>
                    {item.is_weight_based && <td className="px-3 py-2 text-right tabular-nums">{p.price_per_kg != null ? baht(p.price_per_kg) : "—"}</td>}
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">฿{baht(p.unit_cost)}</td>
                    {isAdmin && (
                      <td className="px-3 py-2 text-right">
                        <button onClick={() => delPrice(p.id)} title="ลบราคานี้" className="text-ink-3 hover:text-red-600"><Icon name="trash" size={13} /></button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}


// ── อัปโหลดรูป ──
function ImageField({ label, url, onChange }: { label: string; url: string; onChange: (u: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setBusy(true); setErr("");
    try { onChange(await uploadImage(file)); }
    catch (e2) { setErr(e2 instanceof Error ? e2.message : "อัปโหลดไม่สำเร็จ"); }
    finally { setBusy(false); }
  }
  return (
    <div>
      <label className="block text-xs font-medium text-ink-3 mb-1">{label}</label>
      <div className="flex items-center gap-3">
        {url ? <Thumb url={url} size={48} /> : null}
        <label className="press inline-flex items-center gap-1.5 glass-soft rounded-lg px-3 py-2 text-sm cursor-pointer">
          <Icon name="plus" size={14} /> {busy ? "กำลังอัปโหลด…" : url ? "เปลี่ยนรูป" : "อัปโหลดรูป"}
          <input type="file" accept="image/*" className="hidden" onChange={onFile} disabled={busy} />
        </label>
        {url && <button onClick={() => onChange("")} className="text-ink-3 hover:text-red-600"><Icon name="trash" size={14} /></button>}
      </div>
      {err && <p className="text-xs text-red-600 mt-1">{err}</p>}
    </div>
  );
}

// ── ฟอร์มเพิ่มวัสดุ ──
function AddItemForm({ cats, canViewCost, onManageCat, onCancel, onSaved }: {
  cats: StockCategory[]; canViewCost: boolean; onManageCat: () => void; onCancel: () => void; onSaved: (it: StockItem) => void;
}) {
  const [f, setF] = useState({
    name: "", sku: "", category_id: "", unit: "เส้น", min_qty: "", qty_on_hand: "",
    supplier: "", color: "", image_url: "", is_weight_based: false, weight_per_unit: "", price_per_kg: "", unit_cost: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const computedCost = f.is_weight_based ? (Number(f.price_per_kg) || 0) * (Number(f.weight_per_unit) || 0) : (Number(f.unit_cost) || 0);

  async function save() {
    if (!f.name.trim()) { setErr("ต้องระบุชื่อวัสดุ"); return; }
    setBusy(true); setErr("");
    const res = await fetch("/api/stock", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: f.name, sku: f.sku, category_id: f.category_id || null, unit: f.unit,
        min_qty: Number(f.min_qty) || 0, qty_on_hand: Number(f.qty_on_hand) || 0,
        supplier: f.supplier, color: f.color, image_url: f.image_url,
        is_weight_based: f.is_weight_based, weight_per_unit: Number(f.weight_per_unit) || 0,
        price_per_kg: Number(f.price_per_kg) || 0, unit_cost: Number(f.unit_cost) || 0,
      }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(json.error ?? "บันทึกไม่สำเร็จ"); return; }
    onSaved(json.data as StockItem);
  }

  return (
    <div>
      <h3 className="text-lg font-bold text-brand-dark mb-4">เพิ่มวัสดุใหม่</h3>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <Field label="ชื่อวัสดุ *" value={f.name} onChange={(v) => setF({ ...f, name: v })} wide />
        <label className="block col-span-2">
          <span className="text-xs font-medium text-ink-3 flex items-center justify-between">
            หมวดหมู่
            <button onClick={onManageCat} className="text-brand font-semibold">+ จัดการหมวด</button>
          </span>
          <select value={f.category_id} onChange={(e) => setF({ ...f, category_id: e.target.value })}
            className="w-full glass-soft rounded-lg px-3 py-2 mt-1 outline-none">
            <option value="">— เลือกหมวด —</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <Field label="SKU/รหัส" value={f.sku} onChange={(v) => setF({ ...f, sku: v })} placeholder="เว้นว่าง = สร้างอัตโนมัติ JR#####" />
        <Field label="สี" value={f.color} onChange={(v) => setF({ ...f, color: v })} placeholder="เช่น ดำ / อบขาว" />
        <Field label="หน่วย" value={f.unit} onChange={(v) => setF({ ...f, unit: v })} />
        <Field label="ร้าน/ผู้ขาย" value={f.supplier} onChange={(v) => setF({ ...f, supplier: v })} />
        <Field label="จุดเตือนขั้นต่ำ" value={f.min_qty} onChange={(v) => setF({ ...f, min_qty: v })} type="number" />
        <Field label="ยอดยกมา (คงเหลือเริ่มต้น)" value={f.qty_on_hand} onChange={(v) => setF({ ...f, qty_on_hand: v })} type="number" wide />
      </div>

      {/* รูป */}
      <div className="mt-3"><ImageField label="รูปสินค้า" url={f.image_url} onChange={(u) => setF({ ...f, image_url: u })} /></div>

      {/* ราคา/ต้นทุน — เฉพาะคนที่เห็นราคาได้ (ฝ่ายสโตร์เพิ่มวัสดุได้ แต่ราคาให้บัญชีใส่ทีหลัง) */}
      {canViewCost ? (
        <div className="mt-4 rounded-xl border border-brand/15 bg-black/[0.02] p-3 space-y-2.5">
          <label className="flex items-center gap-2 text-sm font-medium text-ink-1">
            <input type="checkbox" checked={f.is_weight_based} onChange={(e) => setF({ ...f, is_weight_based: e.target.checked })} />
            คิดราคาแบบชั่งน้ำหนัก (อลูมิเนียม — ต่อโล)
          </label>
          {f.is_weight_based ? (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Field label="ราคาต่อโล (฿/กก.)" value={f.price_per_kg} onChange={(v) => setF({ ...f, price_per_kg: v })} type="number" />
              <Field label={`น้ำหนักต่อ 1 ${f.unit} (กก.)`} value={f.weight_per_unit} onChange={(v) => setF({ ...f, weight_per_unit: v })} type="number" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Field label="ต้นทุนต่อหน่วย (฿)" value={f.unit_cost} onChange={(v) => setF({ ...f, unit_cost: v })} type="number" />
            </div>
          )}
          {computedCost > 0 && <p className="text-xs text-ink-3">ต้นทุนต่อ {f.unit} ≈ <b>฿{baht(computedCost)}</b></p>}
        </div>
      ) : (
        <p className="mt-3 text-xs text-ink-3">* ราคา/ต้นทุนให้ฝ่ายบัญชีเป็นผู้กรอกภายหลัง</p>
      )}

      {err && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2 mt-3">{err}</p>}
      <div className="flex gap-2 mt-4">
        <button onClick={save} disabled={busy} className="press rounded-xl px-5 py-2.5 text-sm font-semibold text-white bg-brand shadow-brand disabled:opacity-60">
          {busy ? "กำลังบันทึก…" : "บันทึก"}
        </button>
        <button onClick={onCancel} className="press glass-soft rounded-xl px-5 py-2.5 text-sm text-ink-2">ยกเลิก</button>
      </div>
    </div>
  );
}

// ── ฟอร์มแก้วัสดุ ──
function EditItemForm({ item, cats, canViewCost, onManageCat, onSaved }: {
  item: StockItem; cats: StockCategory[]; canViewCost: boolean; onManageCat: () => void; onSaved: (it: StockItem) => void;
}) {
  const [f, setF] = useState({
    name: item.name, sku: item.sku, category_id: item.category_id ? String(item.category_id) : "",
    unit: item.unit, min_qty: String(item.min_qty), supplier: item.supplier, color: item.color ?? "", image_url: item.image_url,
    is_weight_based: item.is_weight_based, weight_per_unit: String(item.weight_per_unit || ""),
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    setBusy(true); setErr("");
    const res = await fetch(`/api/stock/${item.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: f.name, sku: f.sku, category_id: f.category_id || null, unit: f.unit,
        min_qty: Number(f.min_qty) || 0, supplier: f.supplier, color: f.color, image_url: f.image_url,
        is_weight_based: f.is_weight_based, weight_per_unit: Number(f.weight_per_unit) || 0,
      }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(json.error ?? "บันทึกไม่สำเร็จ"); return; }
    onSaved(json.data as StockItem);
  }

  return (
    <div className="mt-3 rounded-xl border border-brand/20 bg-brand/5 p-3 space-y-2.5">
      <div className="grid grid-cols-2 gap-3 text-sm">
        <Field label="ชื่อวัสดุ" value={f.name} onChange={(v) => setF({ ...f, name: v })} wide />
        <label className="block col-span-2">
          <span className="text-xs font-medium text-ink-3 flex items-center justify-between">
            หมวดหมู่ <button onClick={onManageCat} className="text-brand font-semibold">+ จัดการหมวด</button>
          </span>
          <select value={f.category_id} onChange={(e) => setF({ ...f, category_id: e.target.value })}
            className="w-full glass-soft rounded-lg px-3 py-2 mt-1 outline-none">
            <option value="">— ไม่ระบุ —</option>
            {/* หมวดเดิมที่ถูกปิดใช้งานแล้ว — โชว์ไว้กันเลือกผิดเงียบๆ */}
            {item.category_id && !cats.some((c) => c.id === item.category_id) && (
              <option value={item.category_id}>{item.category || "หมวดเดิม"} (ปิดใช้งานแล้ว)</option>
            )}
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <Field label="SKU/รหัส" value={f.sku} onChange={(v) => setF({ ...f, sku: v })} />
        <Field label="สี" value={f.color} onChange={(v) => setF({ ...f, color: v })} placeholder="เช่น ดำ / อบขาว" />
        <Field label="หน่วย" value={f.unit} onChange={(v) => setF({ ...f, unit: v })} />
        <Field label="ร้าน/ผู้ขาย" value={f.supplier} onChange={(v) => setF({ ...f, supplier: v })} />
        <Field label="จุดเตือนขั้นต่ำ" value={f.min_qty} onChange={(v) => setF({ ...f, min_qty: v })} type="number" />
      </div>
      {canViewCost && (
        <>
          <label className="flex items-center gap-2 text-sm font-medium text-ink-1">
            <input type="checkbox" checked={f.is_weight_based} onChange={(e) => setF({ ...f, is_weight_based: e.target.checked })} />
            คิดราคาแบบชั่งน้ำหนัก (ต่อโล)
          </label>
          {f.is_weight_based && (
            <Field label={`น้ำหนักต่อ 1 ${f.unit} (กก.)`} value={f.weight_per_unit} onChange={(v) => setF({ ...f, weight_per_unit: v })} type="number" />
          )}
        </>
      )}
      <ImageField label="รูปสินค้า" url={f.image_url} onChange={(u) => setF({ ...f, image_url: u })} />
      {err && <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{err}</p>}
      <button onClick={save} disabled={busy} className="press rounded-xl px-4 py-2 text-sm font-semibold text-white bg-brand disabled:opacity-60">
        {busy ? "กำลังบันทึก…" : "บันทึกการแก้ไข"}
      </button>
    </div>
  );
}

// ── จัดการหมวดหมู่ ──
function CategoryManager({ cats, onClose, onChanged }: { cats: StockCategory[]; onClose: () => void; onChanged: () => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function add() {
    if (!name.trim()) return;
    setBusy(true); setErr("");
    const res = await fetch("/api/stock/categories", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(json.error ?? "เพิ่มไม่สำเร็จ"); return; }
    setName(""); onChanged();
  }
  async function del(id: number) {
    if (!confirm("ลบ/ปิดหมวดนี้?")) return;
    const res = await fetch(`/api/stock/categories/${id}`, { method: "DELETE" });
    if (res.ok) onChanged(); else { const j = await res.json().catch(() => null); alert(j?.error ?? "ลบไม่ได้"); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-2xl p-5 shadow-xl">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-brand-dark">จัดการหมวดหมู่วัสดุ</h3>
          <button onClick={onClose} className="text-ink-3 hover:text-ink-1 text-xl leading-none">✕</button>
        </div>
        <div className="flex gap-2 mb-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ชื่อหมวดใหม่ เช่น เส้นอลู, กระจก, อุปกรณ์"
            className="flex-1 glass-soft rounded-lg px-3 py-2 text-sm outline-none" onKeyDown={(e) => e.key === "Enter" && add()} />
          <button onClick={add} disabled={busy} className="press rounded-lg px-4 py-2 text-sm font-semibold text-white bg-brand disabled:opacity-60">เพิ่ม</button>
        </div>
        {err && <p className="text-xs text-red-600 mb-2">{err}</p>}
        <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
          {cats.length === 0 && <p className="text-sm text-ink-3">ยังไม่มีหมวด — เพิ่มด้านบน</p>}
          {cats.map((c) => (
            <div key={c.id} className="flex items-center justify-between glass-soft rounded-lg px-3 py-2 text-sm">
              <span>{c.name}</span>
              <button onClick={() => del(c.id)} className="text-ink-3 hover:text-red-600"><Icon name="trash" size={14} /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── input ทั่วไป (มี list = datalist สำหรับเลือกเดิม+เพิ่มใหม่) ──
function Field({ label, value, onChange, wide, type = "text", placeholder, autoFocus, list }: {
  label: string; value: string; onChange: (v: string) => void; wide?: boolean; type?: string; placeholder?: string; autoFocus?: boolean; list?: string;
}) {
  return (
    <label className={`block ${wide ? "col-span-2" : ""}`}>
      <span className="text-xs font-medium text-ink-3">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoFocus={autoFocus} list={list}
        className="w-full glass-soft rounded-lg px-3 py-2 mt-1 outline-none" />
    </label>
  );
}
