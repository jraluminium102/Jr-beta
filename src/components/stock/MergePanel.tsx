"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";
import { baht } from "@/lib/money";
import type { StockItem } from "@/lib/types";
import { calcLink, isAluCode, type CalcSection } from "@/lib/calculator40/stock-link";
import { isInCutlist } from "@/lib/cutlist/codes";

// section ที่คิดราคา 4.0 "ผูกด้วยชื่อ" (กระจก/หลังคา/มอเตอร์/งานเสริม/ถอดทุน) — ต่างจากที่ผูกด้วยรหัส (อลูรหัส/เหล็ก)
const NAME_SECTIONS: CalcSection[] = ["กระจก", "หลังคา/ผนัง", "มอเตอร์/ออโต้", "งานเสริม", "ถอดทุน 4.0"];

type Link = { cut: boolean; aluCode: boolean; calc: ReturnType<typeof calcLink>; nameLinked: boolean; skuLinked: boolean };
function linkOf(it: StockItem): Link {
  const cut = isInCutlist(it.sku);
  const aluCode = isAluCode(it.sku);
  const calc = calcLink(it);
  const nameLinked = calc.linked && !!calc.section && NAME_SECTIONS.includes(calc.section);
  const skuLinked = cut || aluCode || calc.section === "เหล็ก";
  return { cut, aluCode, calc, nameLinked, skuLinked };
}

function LinkBadges({ it }: { it: StockItem }) {
  const l = linkOf(it);
  if (!l.cut && !l.calc.linked) return <span className="text-[11px] text-ink-3">— ไม่ผูกระบบอื่น</span>;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {l.calc.linked && <span className="text-[11px] font-semibold text-brand-dark bg-brand/10 rounded-full px-2 py-0.5">🧮 คิดราคา · {l.calc.section}</span>}
      {l.cut && <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-100 rounded-full px-2 py-0.5">✂️ ใบตัด</span>}
    </span>
  );
}

export default function MergePanel({ keepItem, canViewCost, onClose, onMerged }: {
  keepItem: StockItem;
  canViewCost: boolean;
  onClose: () => void;
  onMerged: (removedIds: number[], keepId: number) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<StockItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [remove, setRemove] = useState<StockItem | null>(null);
  const [moveSku, setMoveSku] = useState(true);
  const [moveName, setMoveName] = useState(true);
  const [priceMode, setPriceMode] = useState<"keep" | "remove">("keep"); // ราคาที่คิดราคา4.0/ใบตัดจะใช้ (default = ตัวที่เก็บ)
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const reqRef = useRef(0);

  // ค้นหาตัวซ้ำ (debounce เบา ๆ) — ไม่รวมตัวที่เก็บเอง
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults([]); return; }
    const my = ++reqRef.current;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/stock?q=${encodeURIComponent(term)}`);
        const j = await r.json().catch(() => null);
        if (my !== reqRef.current) return;
        const rows = (j?.data ?? []).filter((x: StockItem) => x.id !== keepItem.id);
        setResults(rows.slice(0, 30));
      } finally { if (my === reqRef.current) setSearching(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [q, keepItem.id]);

  const rl = remove ? linkOf(remove) : null;
  const kl = linkOf(keepItem);
  const removeQty = Number(remove?.qty_on_hand ?? 0);
  const qtyBlocked = !!remove && removeQty !== 0;

  // ตัวเลือกย้าย "ตัวตน" — โชว์เฉพาะเมื่อจำเป็น (ตัวที่ลบผูกอยู่ แต่ตัวที่เก็บยังไม่ได้ผูกด้วยตัวตนนั้น)
  // ย้ายรหัสได้เฉพาะเมื่อ "ตัวหลักยังไม่ได้ผูกด้วยรหัสของตัวเอง" (กันทับรหัสที่ตัวหลักใช้อยู่แล้วเงียบ ๆ)
  const canMoveSku = !!remove && !!(remove.sku || "").trim() && rl!.skuLinked && !kl.skuLinked && String(keepItem.sku || "") !== String(remove.sku || "");
  const canMoveName = !!remove && rl!.nameLinked && !kl.nameLinked && String(keepItem.name) !== String(remove.name);
  // ราคาที่ตัวหลักจะใช้ = ราคาที่คิดราคา 4.0 + ใบตัด อ่านไปใช้ · อลูคิดต่อโล = ใช้ ฿/กก.
  const wb = !!(keepItem.is_weight_based || remove?.is_weight_based);
  const removeCost = Number(remove?.unit_cost ?? 0);
  const keepCost = Number(keepItem.unit_cost ?? 0);
  const removeKg = Number(remove?.price_per_kg ?? 0);
  const keepKg = Number(keepItem.price_per_kg ?? 0);
  const keepPrice = wb ? keepKg : keepCost;
  const removePrice = wb ? removeKg : removeCost;
  const priceUnit = wb ? "/กก." : "";
  const removeHasPrice = canViewCost && !!remove && removePrice > 0;
  const bothPriced = removeHasPrice && keepPrice > 0 && removePrice !== keepPrice;   // มีให้เลือก (ราคาต่างกัน)
  const onlyRemovePriced = removeHasPrice && keepPrice === 0;                          // ตัวเก็บยังไม่มีราคา → เติมของตัวลบ

  async function doMerge() {
    if (!remove) return;
    setBusy(true); setErr("");
    try {
      const body: Record<string, unknown> = { keepId: keepItem.id, removeIds: [remove.id] };
      if (canMoveSku && moveSku) body.newSku = remove.sku;
      if (canMoveName && moveName) body.newName = remove.name;
      body.priceMode = bothPriced ? priceMode : "keep"; // เลือกได้เฉพาะตอนราคาต่างกัน · นอกนั้น keep(เติมถ้าว่าง)
      const r = await fetch("/api/stock/merge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => null);
      if (!r.ok) { setErr(j?.error ?? "รวมไม่สำเร็จ"); return; }
      onMerged([remove.id], keepItem.id);
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white rounded-2xl p-5 shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-bold text-brand-dark text-lg">🔀 รวมรายการซ้ำ</h3>
          <button onClick={onClose} aria-label="ปิด" className="text-ink-3 hover:text-ink-1"><Icon name="close" size={20} /></button>
        </div>
        <p className="text-xs text-ink-3 mb-3">
          เก็บตัวนี้ไว้ แล้วเลือก &quot;ตัวซ้ำ&quot; (สต็อก 0) มายุบรวม — ประวัติ/การผูกใบตัด/คิดราคา จะย้ายมาลงตัวที่เก็บให้อัตโนมัติ
        </p>

        {/* ตัวที่เก็บ (canonical) */}
        <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50/60 p-3 mb-3">
          <div className="text-[11px] font-bold text-emerald-700 mb-1">✓ เก็บไว้ (ตัวหลัก)</div>
          <div className="font-semibold text-brand-dark">{keepItem.name}</div>
          <div className="text-xs text-ink-3">
            {keepItem.sku ? `${keepItem.sku} · ` : ""}คงเหลือ {baht(keepItem.qty_on_hand)} {keepItem.unit}
            {canViewCost ? ` · ต้นทุน ฿${baht(keepItem.unit_cost)}` : ""}
          </div>
          <div className="mt-1"><LinkBadges it={keepItem} /></div>
        </div>

        {/* เลือกตัวซ้ำที่จะลบ */}
        {!remove ? (
          <div>
            <label className="relative block mb-2">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"><Icon name="search" size={16} /></span>
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาตัวซ้ำที่จะยุบรวม (ชื่อ/SKU)"
                className="w-full glass-soft rounded-xl pl-9 pr-3 py-2.5 text-sm outline-none" />
            </label>
            <div className="space-y-1.5 max-h-[38vh] overflow-y-auto">
              {searching && <p className="text-sm text-ink-3 py-2 text-center">กำลังค้นหา…</p>}
              {!searching && q.trim().length >= 2 && results.length === 0 && <p className="text-sm text-ink-3 py-2 text-center">ไม่พบวัสดุ</p>}
              {results.map((it) => (
                <button key={it.id} onClick={() => setRemove(it)}
                  className="press w-full text-left rounded-xl px-3 py-2 glass-soft hover:bg-white/80 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm text-brand-dark truncate">{it.name}</div>
                    <div className="text-[11px] text-ink-3 truncate">
                      {it.sku ? `${it.sku} · ` : ""}คงเหลือ {baht(it.qty_on_hand)} {it.unit}
                    </div>
                    <div className="mt-0.5"><LinkBadges it={it} /></div>
                  </div>
                  {Number(it.qty_on_hand) !== 0
                    ? <span className="shrink-0 text-[10px] font-semibold text-amber-700 bg-amber-100 rounded-full px-2 py-0.5">มีของ {baht(it.qty_on_hand)}</span>
                    : <span className="shrink-0 text-[10px] text-ink-3">เลือก →</span>}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div>
            {/* ตัวที่ลบ */}
            <div className="rounded-xl border-2 border-red-300 bg-red-50/60 p-3 mb-3">
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-bold text-red-700 mb-1">✕ ยุบรวม → ลบทิ้ง</div>
                <button onClick={() => { setRemove(null); setErr(""); }} className="text-xs text-brand font-semibold">เปลี่ยน</button>
              </div>
              <div className="font-semibold text-brand-dark">{remove.name}</div>
              <div className="text-xs text-ink-3">
                {remove.sku ? `${remove.sku} · ` : ""}คงเหลือ {baht(remove.qty_on_hand)} {remove.unit}
                {canViewCost ? ` · ต้นทุน ฿${baht(remove.unit_cost)}` : ""}
              </div>
              <div className="mt-1"><LinkBadges it={remove} /></div>
            </div>

            {qtyBlocked ? (
              <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 text-sm text-amber-800">
                ⚠️ ตัวนี้ยังมีของคงเหลือ <b>{baht(remove.qty_on_hand)} {remove.unit}</b> — รวมไม่ได้ (กันของหาย)<br />
                ให้ &quot;ปรับยอด → 0&quot; หรือเบิกออกให้หมดก่อน แล้วค่อยรวม
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-ink-2">จะย้ายมาที่ตัวหลัก:</div>
                {canMoveSku && (
                  <label className="flex items-start gap-2 text-sm rounded-lg glass-soft px-3 py-2 cursor-pointer">
                    <input type="checkbox" className="mt-0.5" checked={moveSku} onChange={(e) => setMoveSku(e.target.checked)} />
                    <span>
                      <b>ย้ายรหัส {remove.sku}</b> มาที่ตัวหลัก
                      <div className="text-[11px] text-ink-3">
                        {rl!.cut && "ใบตัด/ตัดประกอบจะมาหักสต็อกตัวหลักแทน "}
                        {rl!.aluCode && "คิดราคา 4.0 (อลูรายเส้น) จะอ่านราคาจากตัวหลัก"}
                        {String(keepItem.sku || "") && <> · รหัสเดิมของตัวหลัก (<span className="line-through">{keepItem.sku}</span>) จะถูกแทนที่</>}
                      </div>
                    </span>
                  </label>
                )}
                {canMoveName && (
                  <label className="flex items-start gap-2 text-sm rounded-lg glass-soft px-3 py-2 cursor-pointer">
                    <input type="checkbox" className="mt-0.5" checked={moveName} onChange={(e) => setMoveName(e.target.checked)} />
                    <span>
                      <b>เปลี่ยนชื่อตัวหลักเป็น &quot;{remove.name}&quot;</b>
                      <div className="text-[11px] text-ink-3">คิดราคา 4.0 ({rl!.calc.section}) ผูกด้วยชื่อ — ต้องใช้ชื่อนี้ราคาถึงจะลิงก์ · ชื่อเดิม &quot;{keepItem.name}&quot; จะเปลี่ยน</div>
                    </span>
                  </label>
                )}
                {onlyRemovePriced && (
                  <div className="text-sm rounded-lg glass-soft px-3 py-2">
                    <b>เติมราคา ฿{baht(removePrice)}{priceUnit}</b> ให้ตัวหลัก (ตอนนี้ยังไม่มีราคา)
                    <div className="text-[11px] text-ink-3">ราคานี้จะเป็นราคาที่คิดราคา 4.0 + ใบตัด ใช้</div>
                  </div>
                )}
                {bothPriced && (
                  <div className="text-sm rounded-lg glass-soft px-3 py-2">
                    <div className="mb-1 font-medium">ราคาที่คิดราคา 4.0 / ใบตัด จะใช้:</div>
                    <div className="flex flex-col gap-1.5">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="pmode" checked={priceMode === "keep"} onChange={() => setPriceMode("keep")} />
                        <span>ราคาตัวที่เก็บ <b>฿{baht(keepPrice)}{priceUnit}</b> <span className="text-[11px] text-ink-3">(ค่าเริ่มต้น)</span></span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="pmode" checked={priceMode === "remove"} onChange={() => setPriceMode("remove")} />
                        <span>ราคาตัวที่ลบ <b>฿{baht(removePrice)}{priceUnit}</b> <span className="text-[11px] text-ink-3">(เอามาทับ)</span></span>
                      </label>
                    </div>
                  </div>
                )}
                {!canMoveSku && !canMoveName && !bothPriced && !onlyRemovePriced && (
                  <p className="text-[11px] text-ink-3">ไม่มีการผูกระบบ/ราคาที่ต้องย้าย — จะแค่ย้ายประวัติแล้วลบตัวซ้ำ</p>
                )}
              </div>
            )}

            {err && <p role="alert" className="mt-3 text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{err}</p>}
            <div className="flex gap-2 mt-4">
              <button onClick={doMerge} disabled={busy || qtyBlocked}
                className="press flex-1 rounded-xl py-2.5 text-sm font-semibold text-white bg-red-600 disabled:opacity-50">
                {busy ? "กำลังรวม…" : "ยืนยันรวม (ลบตัวซ้ำ)"}
              </button>
              <button onClick={onClose} disabled={busy} className="press glass-soft rounded-xl px-5 py-2.5 text-sm text-ink-2">ยกเลิก</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
