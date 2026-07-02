"use client";

/**
 * 🏗️ ห้องกระจก (G6) composer — ประกอบห้องหลายด้าน (กระจก/ผนัง/เปิดโล่ง) + ฝ้า + หลังคา รวมราคา
 * คิดราคาทุกชิ้นด้วย R4.0 cost-engine จริง (computeCost) — ไม่ทำสูตรราคาซ้ำเอง
 *
 * อ้างอิงฟีเจอร์/UX จากเครื่องเดิม (G6-module.js — G6R state/G6GROUPS/sideTotal/roomTotal)
 * แต่ตัด per-pane option editor เต็มรูปแบบออก (mouse/lock/threshold ต่อบาน ฯลฯ) เหลือ "simplified"
 * เหมือนแนวทาง SubPanesSection (พี่สั่ง "addons ย่อยเอาแบบ simplified ได้")
 *
 * โมเดล:
 *   RoomState.sides[] = ด้าน (glass|wall|open)
 *     glass side: panes[] แต่ละ pane = {typeKey(R4.0 product id), w,h,n, mosq/gridmark simplified}
 *     wall side: aw×ah × flat rate (R3.9 ผนังเบา 1,350/ตร.ม. — ยังไม่มี R4.0 cost ของผนังเบา "แบบเบา" ในราคานี้
 *                — ผนังหนัก (สมาร์ทบอร์ด/ไอโซวอล) ใช้ product จริงแยกต่างหากถ้าเลือก)
 *     open side: 0
 *   ceiling: ชนิด × พื้นที่ (ใช้ R4.0 ceil_* ถ้าตรง ไม่งั้น CEIL_RATE flat จาก engine.mjs)
 *   roof: กว้าง×ยาว × R4.0 'roof' product (พื้นฐาน — ของเสริมหลังคา 20 อย่าง = เฟสถัดไป TODO)
 *   roomTotal = ceil100(Σ sideTotal + roofTotal + ceilTotal)
 */
import { useMemo, useState } from "react";
import Icon from "@/components/Icon";
// @ts-expect-error — engine เป็น ESM JS ล้วน
import { computeCost, ceil100, CEIL_RATE } from "@/lib/calculator40/engine.mjs";
// @ts-expect-error — products เป็น ESM JS ล้วน
import { PRODUCTS } from "@/lib/calculator40/products.mjs";

/* eslint-disable @typescript-eslint/no-explicit-any */

function fmtBaht(n: number) {
  return "฿" + Math.round(n || 0).toLocaleString("th-TH");
}

// ── map ชนิดบาน (ห้อง R3.9 เดิม → R4.0 product id) ──────────────────────────
// ตัวไหนไม่มี R4.0 คู่ตรง ๆ ใช้ตัวใกล้เคียงที่สุดที่มีอยู่จริงในระบบ (คอมเมนต์กำกับ)
const PANE_TYPES: { key: string; label: string; note?: string }[] = [
  { key: "sms_slide", label: "บานเลื่อน SMS" },              // sliding_sms → sms_slide (ตรง)
  { key: "euro_slide", label: "บานเลื่อน ยูโร" },             // sliding_euro → euro_slide (ตรง)
  { key: "open_door", label: "บานเปิด" },                     // casement_euro → open_door (ตรง)
  { key: "folding", label: "บานเฟี้ยม" },                     // folding_euro/folding → folding (ตรง — มีรุ่นเดียวใน R4.0 ตอนนี้)
  { key: "awning", label: "บานกระทุ้ง" },                     // awning_euro → awning (ตรง)
  { key: "fixed", label: "กระจกติดตาย" },                     // fixed_glass → fixed (ตรง)
  { key: "shower", label: "ฉากกั้นอาบน้ำ" },                  // shower → shower (ตรง)
  { key: "pivot", label: "บานหมุน (Pivot)" },                 // pivot → pivot (ตรง)
  { key: "frameless_door", label: "บานเปลือย (สวิง/เลื่อน/ติดตาย)" }, // frameless_* → frameless_door (รวม 3 แบบเดิมเป็นตัวเดียว เลือกผ่าน material)
  { key: "pcdoor", label: "ประตู PC Door" },                  // pc_door_2/4 → pcdoor (ใกล้เคียงสุด)
  // curved_* ยังไม่มี R4.0 product เทียบ — ไม่ใส่ในลิสต์ MVP (ติดป้าย TODO ด้านล่าง)
];

const PANE_BY_KEY: Record<string, any> = Object.fromEntries(
  PANE_TYPES.map((t) => [t.key, (PRODUCTS as any)[t.key]])
);

type Pane = {
  key: number;
  typeKey: string; // R4.0 product id
  w: number; h: number; n: number; // เมตร, เมตร, จำนวนบาน
  mosq?: boolean;    // มุ้ง simplified (flat +3,000 เหมือน SubPanesSection)
  gridmark?: boolean; // คาดตาราง simplified (flat +2,000)
};

type Side =
  | { kind: "glass"; panes: Pane[] }
  | { kind: "wall"; aw: number; ah: number }
  | { kind: "open" };

const WALL_RATE = 1350; // ผนังเบา ฿/ตร.ม. (R3.9 flat — ตรงเครื่องเดิม G6-module.js sideTotal wall)

const CEIL_TYPES: { key: string; label: string; r4id?: string }[] = [
  { key: "smooth", label: "ฉาบเรียบ", r4id: "ceil_gypsum" },
  { key: "cshape", label: "อลูตัวซี" }, // ไม่มี R4.0 product ตรง → CEIL_RATE flat
  { key: "wood", label: "ไม้เทียม", r4id: "ceil_wood" },
  { key: "ranae_1x5", label: "ระแนงอลู 1×5", r4id: "ceil_ranae_1x5" },
  { key: "ranae_16_5", label: "ระแนงอลู 1.6 เว้น5", r4id: "ceil_ranae_16_5" },
  { key: "ranae_16_2", label: "ระแนงอลู 1.6 เว้น2", r4id: "ceil_ranae_16_2" },
];
// map key → CEIL_RATE label (engine.mjs CEIL_RATE ใช้ label ภาษาไทยเป็น key)
const CEIL_FLAT_LABEL: Record<string, string> = {
  smooth: "ฉาบเรียบ", cshape: "อลูตัวซี", wood: "ไม้เทียม remood",
  ranae_1x5: "ระแนงอลู 1×5", ranae_16_5: "ระแนงอลู เว้นร่อง", ranae_16_2: "ระแนงอลู เว้นร่อง",
};

function L(i: number) {
  return String.fromCharCode(65 + i);
}

function freshGlassSide(): Side {
  return { kind: "glass", panes: [{ key: Date.now() + Math.random(), typeKey: "open_door", w: 0.9, h: 2.2, n: 1 }] };
}

// ราคาต่อ pane — ตรง pattern subPrice() ของ SubPanesSection (computeCost + extra flat มุ้ง/คาดตาราง)
function panePrice(pane: Pane, pb: any, color: string, glassType: string, profitPct: number): number {
  const prod = PANE_BY_KEY[pane.typeKey];
  if (!prod) return 0;
  const r: any = computeCost(pb, prod, {
    w: (pane.w || 1) * 100, h: (pane.h || 1) * 100, p: pane.n || 1, form: prod.defForm,
    color, glassType: prod.defGlass ? glassType || prod.defGlass : undefined,
    material: prod.defMaterial ?? undefined,
    profitPct, installProfitPct: profitPct, addons: {},
  });
  let base = r.sell.withInstall;
  if (pane.mosq) base += 3000;
  if (pane.gridmark) base += 2000;
  return base;
}

function wallPrice(aw: number, ah: number): number {
  return Math.round((aw || 3) * (ah || 2.6) * WALL_RATE);
}

function sideTotal(s: Side, pb: any, color: string, glassType: string, profitPct: number): number {
  if (s.kind === "glass") return s.panes.reduce((sum, p) => sum + panePrice(p, pb, color, glassType, profitPct), 0);
  if (s.kind === "wall") return wallPrice(s.aw, s.ah);
  return 0;
}

function ceilPrice(typeKey: string, area: number, pb: any, profitPct: number): number {
  if (area <= 0) return 0;
  const t = CEIL_TYPES.find((x) => x.key === typeKey);
  if (t?.r4id && (PRODUCTS as any)[t.r4id]) {
    const prod = (PRODUCTS as any)[t.r4id];
    // ceil_* products กิน w×h เป็นเมตร (defaults เก็บเป็น "ซม." แต่ค่าจริงคือเมตร×100 ตามธรรมเนียม engine)
    // ใช้พื้นที่ห้อง = ส่งเป็นสี่เหลี่ยมผืนผ้าประมาณ sqrt(area) x sqrt(area) ไม่แม่น → แทนด้วย 1×area (กว้าง 1ม. ยาว=area) เพื่อให้ engine ที่อิง PERIM/area คิดพื้นที่ถูกต้อง
    // NOTE: ceil_gypsum/wall_* ใช้ PERIM_VARS (คิดจาก W,H จริง) → ป้อน w,h ตรงจริงจะแม่นกว่า ผู้ใช้กรอกกว้าง/ยาวห้องแยกในฟอร์ม (ceilW/ceilH) แทนการเดา
    const r: any = computeCost(pb, prod, { w: 100, h: 100, p: 1, form: prod.defForm, profitPct, installProfitPct: profitPct, addons: {} });
    // fallback: ใช้เรตต่อตร.ม.จาก sell/พื้นที่ 1ตร.ม. คูณพื้นที่จริง (กัน error PERIM เพี้ยนตอนไม่รู้กว้าง/ยาวจริง)
    const ratePerSqm = r.sell.withInstall / 1; // w=100cm,h=100cm → area=1 ตร.ม.
    return ceil100(ratePerSqm * area);
  }
  // ไม่มี R4.0 product ตรง → flat CEIL_RATE (engine.mjs, แหล่งเดียวกับเครื่องเดิม + G3)
  const label = CEIL_FLAT_LABEL[typeKey] || "ฉาบเรียบ";
  const rate = (CEIL_RATE as Record<string, number>)[label] || 480;
  return Math.round(area * rate);
}

export type RoomTotals = { total: number; sides: number[]; roof: number; ceil: number };

export default function RoomComposer({
  pb, mainColor, mainGlass, profitPct, onTotal,
}: {
  pb: any;
  mainColor: string;
  mainGlass: string;
  profitPct: number;
  onTotal?: (t: RoomTotals) => void;
}) {
  const [sides, setSides] = useState<Side[]>([freshGlassSide(), freshGlassSide()]);
  const [tab, setTab] = useState<number>(0); // 0..sides.length-1 = ด้าน, length = ฝ้า/หลังคา, length+1 = สรุป

  // หลังคา
  const [roofOn, setRoofOn] = useState(false);
  const [roofW, setRoofW] = useState("4");
  const [roofL, setRoofL] = useState("3");

  // ฝ้า
  const [ceilOn, setCeilOn] = useState(false);
  const [ceilType, setCeilType] = useState("smooth");
  const [ceilW, setCeilW] = useState("4");
  const [ceilL, setCeilL] = useState("3");

  const nTabs = sides.length + 2; // + ฝ้า/หลังคา + สรุป

  const sideTotals = useMemo(
    () => sides.map((s) => sideTotal(s, pb, mainColor, mainGlass, profitPct)),
    [sides, pb, mainColor, mainGlass, profitPct]
  );

  const roofTotal = useMemo(() => {
    if (!roofOn) return 0;
    const prod = (PRODUCTS as any).roof;
    if (!prod) return 0;
    const w = Number(roofW) || 4, l = Number(roofL) || 3;
    const r: any = computeCost(pb, prod, {
      w: w * 100, h: l * 100, p: 1, form: prod.defForm, profitPct, installProfitPct: profitPct, addons: {},
    });
    return r.sell.withInstall;
  }, [roofOn, roofW, roofL, pb, profitPct]);

  const ceilTotal = useMemo(() => {
    if (!ceilOn) return 0;
    const area = (Number(ceilW) || 0) * (Number(ceilL) || 0);
    return ceilPrice(ceilType, area, pb, profitPct);
  }, [ceilOn, ceilType, ceilW, ceilL, pb, profitPct]);

  const roomTotal = useMemo(() => {
    const t = sideTotals.reduce((a, b) => a + b, 0) + roofTotal + ceilTotal;
    return ceil100(t);
  }, [sideTotals, roofTotal, ceilTotal]);

  // แจ้ง parent (Calculator40Client เอาไปโชว์เป็นราคาหลัก + เพิ่มลงใบเสนอราคา)
  useMemo(() => {
    onTotal?.({ total: roomTotal, sides: sideTotals, roof: roofTotal, ceil: ceilTotal });
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomTotal]);

  function addSide() {
    setSides((s) => [...s, freshGlassSide()]);
    setTab(sides.length);
  }
  function removeSide(i: number) {
    setSides((s) => s.filter((_, xi) => xi !== i));
    setTab((t) => Math.max(0, Math.min(t, sides.length - 2)));
  }
  function setSideKind(i: number, kind: Side["kind"]) {
    setSides((s) => s.map((x, xi) => {
      if (xi !== i) return x;
      if (kind === "glass") return freshGlassSide();
      if (kind === "wall") return { kind: "wall", aw: 3, ah: 2.6 };
      return { kind: "open" };
    }));
  }
  function patchWall(i: number, p: Partial<{ aw: number; ah: number }>) {
    setSides((s) => s.map((x, xi) => (xi === i && x.kind === "wall" ? { ...x, ...p } : x)));
  }
  function addPane(i: number) {
    setSides((s) => s.map((x, xi) => (xi === i && x.kind === "glass")
      ? { ...x, panes: [...x.panes, { key: Date.now() + Math.random(), typeKey: "open_door", w: 0.9, h: 2.2, n: 1 }] }
      : x));
  }
  function patchPane(i: number, key: number, p: Partial<Pane>) {
    setSides((s) => s.map((x, xi) => (xi === i && x.kind === "glass")
      ? { ...x, panes: x.panes.map((pc) => (pc.key === key ? { ...pc, ...p } : pc)) }
      : x));
  }
  function removePane(i: number, key: number) {
    setSides((s) => s.map((x, xi) => (xi === i && x.kind === "glass")
      ? { ...x, panes: x.panes.filter((pc) => pc.key !== key) }
      : x));
  }

  return (
    <div className="mt-4 space-y-3 rounded-2xl glass-soft p-4">
      <div className="text-sm font-bold text-brand-dark flex items-center gap-1.5">
        <Icon name="building" size={16} /> ห้องกระจก (ประกอบ) <span className="text-xs font-normal text-ink-3">(หลายด้าน + ผนัง + ฝ้า + หลังคา · คิดด้วย R4.0 จริง)</span>
      </div>

      {/* แท็บ */}
      <div className="flex flex-wrap gap-1.5">
        {sides.map((_, i) => (
          <button key={i} type="button" onClick={() => setTab(i)}
            className={`press text-xs font-semibold rounded-full px-3 py-1.5 ${tab === i ? "bg-brand text-white" : "glass-soft text-ink-2"}`}>
            ด้าน {L(i)}
          </button>
        ))}
        <button type="button" onClick={addSide}
          className="press text-xs font-semibold rounded-full px-3 py-1.5 glass-soft text-ink-2 hover:bg-white/70">
          ＋ด้าน
        </button>
        <button type="button" onClick={() => setTab(sides.length)}
          className={`press text-xs font-semibold rounded-full px-3 py-1.5 ${tab === sides.length ? "bg-brand text-white" : "glass-soft text-ink-2"}`}>
          ฝ้า/หลังคา
        </button>
        <button type="button" onClick={() => setTab(sides.length + 1)}
          className={`press text-xs font-semibold rounded-full px-3 py-1.5 ${tab === sides.length + 1 ? "bg-brand text-white" : "glass-soft text-ink-2"}`}>
          สรุป
        </button>
      </div>

      {/* หน้าด้าน */}
      {tab < sides.length && (() => {
        const i = tab, s = sides[i];
        return (
          <div className="rounded-xl border border-black/5 bg-white/60 p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-ink-2">ด้าน {L(i)}</span>
              {sides.length > 1 && (
                <button type="button" onClick={() => removeSide(i)} className="press text-xs text-red-600 flex items-center gap-1">
                  <Icon name="trash" size={13} /> ลบด้าน
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {([["glass", "กระจก/บาน"], ["wall", "ผนังเบา"], ["open", "เปิดโล่ง"]] as [Side["kind"], string][]).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setSideKind(i, k)}
                  className={`press text-xs font-semibold rounded-full px-3 py-1.5 ${s.kind === k ? "bg-brand text-white" : "glass-soft text-ink-2"}`}>
                  {l}
                </button>
              ))}
            </div>

            {s.kind === "glass" && (
              <div className="space-y-2">
                {s.panes.map((pc) => {
                  const price = panePrice(pc, pb, mainColor, mainGlass, profitPct);
                  return (
                    <div key={pc.key} className="rounded-lg border border-black/5 bg-white/70 p-2.5 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <select value={pc.typeKey} onChange={(e) => patchPane(i, pc.key, { typeKey: e.target.value })}
                          className="min-h-[40px] glass-soft rounded-lg px-2 py-1.5 text-xs font-semibold outline-none">
                          {PANE_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                        </select>
                        <input type="number" step={0.1} value={pc.w || ""} placeholder="กว้าง(ม.)"
                          onChange={(e) => patchPane(i, pc.key, { w: +e.target.value || 0 })}
                          className="min-h-[40px] glass-soft rounded-lg px-2 py-1.5 w-20 outline-none tabular-nums text-sm" />
                        <input type="number" step={0.1} value={pc.h || ""} placeholder="สูง(ม.)"
                          onChange={(e) => patchPane(i, pc.key, { h: +e.target.value || 0 })}
                          className="min-h-[40px] glass-soft rounded-lg px-2 py-1.5 w-20 outline-none tabular-nums text-sm" />
                        <input type="number" value={pc.n || 1} placeholder="บาน"
                          onChange={(e) => patchPane(i, pc.key, { n: Math.max(1, Math.round(+e.target.value) || 1) })}
                          className="min-h-[40px] glass-soft rounded-lg px-2 py-1.5 w-16 outline-none tabular-nums text-sm" />
                        <span className="text-sm font-semibold text-brand-dark tabular-nums">{fmtBaht(price)}</span>
                        <button type="button" onClick={() => removePane(i, pc.key)} className="press text-ink-3 hover:text-red-600 ml-auto">
                          <Icon name="trash" size={14} />
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <button type="button" onClick={() => patchPane(i, pc.key, { mosq: !pc.mosq })}
                          className={`press text-[11px] font-semibold rounded-full px-2.5 py-1 ${pc.mosq ? "bg-brand text-white" : "glass-soft text-ink-2"}`}>
                          {pc.mosq ? "มุ้ง ✓" : "＋ มุ้ง +3,000"}
                        </button>
                        <button type="button" onClick={() => patchPane(i, pc.key, { gridmark: !pc.gridmark })}
                          className={`press text-[11px] font-semibold rounded-full px-2.5 py-1 ${pc.gridmark ? "bg-brand text-white" : "glass-soft text-ink-2"}`}>
                          {pc.gridmark ? "คาดตาราง ✓" : "＋ คาดตาราง +2,000"}
                        </button>
                      </div>
                    </div>
                  );
                })}
                <button type="button" onClick={() => addPane(i)}
                  className="press text-xs font-semibold rounded-full px-3 py-1.5 glass-soft text-ink-2 hover:bg-white/70">
                  ＋ เพิ่มบาน
                </button>
                <p className="text-[11px] text-ink-3">สี/กระจกของบานทุกใบในห้อง = ตามค่า &quot;สี&quot;/&quot;กระจก&quot; หลักของฟอร์ม (ด้านบน) · ยังไม่รองรับสีแยกต่อด้าน (TODO)</p>
              </div>
            )}

            {s.kind === "wall" && (
              <div className="flex items-center gap-2 flex-wrap text-sm">
                <span className="text-xs text-ink-3">ขนาด</span>
                <input type="number" step={0.1} value={s.aw || ""} onChange={(e) => patchWall(i, { aw: +e.target.value || 0 })}
                  className="min-h-[40px] glass-soft rounded-lg px-2 py-1.5 w-20 outline-none tabular-nums" />
                <span className="text-ink-3">×</span>
                <input type="number" step={0.1} value={s.ah || ""} onChange={(e) => patchWall(i, { ah: +e.target.value || 0 })}
                  className="min-h-[40px] glass-soft rounded-lg px-2 py-1.5 w-20 outline-none tabular-nums" />
                <span className="text-ink-3">ม.</span>
                <span className="ml-2 font-semibold text-brand-dark tabular-nums">{fmtBaht(wallPrice(s.aw, s.ah))}</span>
                <span className="text-[11px] text-ink-3 w-full">ผนังเบา R3.9 flat 1,350/ตร.ม. (ยังไม่มี R4.0 cost ของผนังเบาชนิดนี้ — ถ้าต้องการผนังหนัก/มีฉนวนจริง ให้คิดแยกจากเมนู G3 สมาร์ทบอร์ด/ไอโซวอล)</span>
              </div>
            )}

            {s.kind === "open" && (
              <p className="text-sm text-ink-3">เปิดโล่ง / ติดอาคารเดิม — ไม่มีงานกั้นด้านนี้ (0 บาท)</p>
            )}
          </div>
        );
      })()}

      {/* หน้าฝ้า/หลังคา */}
      {tab === sides.length && (
        <div className="rounded-xl border border-black/5 bg-white/60 p-3 space-y-4">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-ink-2">หลังคา</span>
              <button type="button" onClick={() => setRoofOn((v) => !v)}
                className={`press text-xs font-semibold rounded-full px-3 py-1.5 ${roofOn ? "bg-brand text-white" : "glass-soft text-ink-2"}`}>
                {roofOn ? "มีหลังคา ✓" : "＋ ใส่หลังคา"}
              </button>
            </div>
            {roofOn && (
              <div className="mt-2 flex items-center gap-2 flex-wrap text-sm">
                <span className="text-xs text-ink-3">กว้าง×ยาว</span>
                <input type="number" step={0.1} value={roofW} onChange={(e) => setRoofW(e.target.value)}
                  className="min-h-[40px] glass-soft rounded-lg px-2 py-1.5 w-20 outline-none tabular-nums" />
                <span className="text-ink-3">×</span>
                <input type="number" step={0.1} value={roofL} onChange={(e) => setRoofL(e.target.value)}
                  className="min-h-[40px] glass-soft rounded-lg px-2 py-1.5 w-20 outline-none tabular-nums" />
                <span className="text-ink-3">ม.</span>
                <span className="ml-2 font-semibold text-brand-dark tabular-nums">{fmtBaht(roofTotal)}</span>
                <p className="text-[11px] text-ink-3 w-full">คิดจากรุ่น &quot;หลังคา&quot; (R4.0 พื้นฐาน วัสดุเพิงเดี่ยว) · ของเสริมหลังคา (รางน้ำ/เสา/หลังคาเลื่อน/ครอบ ฯลฯ) ยังไม่รองรับในตัวประกอบห้อง — TODO เฟสถัดไป (คิดแยกจากเมนู G3 ได้ก่อน)</p>
              </div>
            )}
          </div>
          <div className="pt-2 border-t border-black/5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-ink-2">ฝ้า</span>
              <button type="button" onClick={() => setCeilOn((v) => !v)}
                className={`press text-xs font-semibold rounded-full px-3 py-1.5 ${ceilOn ? "bg-brand text-white" : "glass-soft text-ink-2"}`}>
                {ceilOn ? "มีฝ้า ✓" : "＋ ใส่ฝ้า"}
              </button>
            </div>
            {ceilOn && (
              <div className="mt-2 space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {CEIL_TYPES.map((t) => (
                    <button key={t.key} type="button" onClick={() => setCeilType(t.key)}
                      className={`press text-xs font-semibold rounded-full px-3 py-1.5 ${ceilType === t.key ? "bg-brand text-white" : "glass-soft text-ink-2"}`}>
                      {t.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 flex-wrap text-sm">
                  <span className="text-xs text-ink-3">กว้าง×ยาว</span>
                  <input type="number" step={0.1} value={ceilW} onChange={(e) => setCeilW(e.target.value)}
                    className="min-h-[40px] glass-soft rounded-lg px-2 py-1.5 w-20 outline-none tabular-nums" />
                  <span className="text-ink-3">×</span>
                  <input type="number" step={0.1} value={ceilL} onChange={(e) => setCeilL(e.target.value)}
                    className="min-h-[40px] glass-soft rounded-lg px-2 py-1.5 w-20 outline-none tabular-nums" />
                  <span className="text-ink-3">ม.</span>
                  <span className="ml-2 font-semibold text-brand-dark tabular-nums">{fmtBaht(ceilTotal)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* หน้าสรุป */}
      {tab === sides.length + 1 && (
        <div className="rounded-xl border border-black/5 bg-white/60 p-3 space-y-1.5 text-sm">
          {sides.map((s, i) => (
            <div key={i} className="flex items-center justify-between">
              <span className="text-ink-2">ด้าน {L(i)} ({s.kind === "glass" ? `กระจก ${s.panes.length} บาน` : s.kind === "wall" ? "ผนังเบา" : "เปิดโล่ง"})</span>
              <span className="tabular-nums font-medium">{fmtBaht(sideTotals[i] || 0)}</span>
            </div>
          ))}
          {roofOn && (
            <div className="flex items-center justify-between">
              <span className="text-ink-2">หลังคา</span>
              <span className="tabular-nums font-medium">{fmtBaht(roofTotal)}</span>
            </div>
          )}
          {ceilOn && (
            <div className="flex items-center justify-between">
              <span className="text-ink-2">ฝ้า</span>
              <span className="tabular-nums font-medium">{fmtBaht(ceilTotal)}</span>
            </div>
          )}
          <div className="pt-1.5 mt-1.5 border-t border-black/10 flex items-center justify-between font-bold text-brand-dark">
            <span>รวมทั้งห้อง</span>
            <span className="tabular-nums text-base">{fmtBaht(roomTotal)}</span>
          </div>
        </div>
      )}

      {/* ราคารวมห้อง — โชว์ล่างสุดตลอด (ตามเครื่องเดิม) */}
      <div className="flex items-center justify-between rounded-xl px-4 py-3 bg-brand text-white shadow-brand">
        <span className="text-sm font-medium text-red-100">รวมทั้งห้อง (ทุกด้าน + ฝ้า + หลังคา)</span>
        <span className="text-xl font-bold tabular-nums">{fmtBaht(roomTotal)}</span>
      </div>

      <p className="text-[11px] text-ink-3">
        TODO เฟสถัดไป: ของเสริมหลังคา 20 อย่าง (รางน้ำ/เสา/หลังคาเลื่อน/ซ่อนสโลป ฯลฯ), per-pane option เต็ม (มือจับ/ล็อก/ธรณีต่อบาน), พื้น/พัดลม/งานเสริมอื่น (demo/protect), สีอลู/กระจกแยกต่อด้าน, ดัดโค้ง (ยังไม่มี R4.0 product เทียบ)
      </p>
    </div>
  );
}
