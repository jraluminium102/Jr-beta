"use client";

/**
 * RoofSidesEditor — ช่องกรอก "หลังคาหลายด้าน" (กันสาด/กลาสเฮ้าส์/จั่ว หักมุมรอบบ้าน ได้ถึง 6 ด้าน)
 * ─────────────────────────────────────────────────────────────────────────────
 * ทำไมต้องมี: ใบตัดหลายด้านรับ 21 ช่อง (กว้าง+ยื่น ×6 ด้าน + รอยต่อ ×5) ถ้าเรียงเป็นช่องเปล่า ๆ
 *   = กำแพงตัวเลข กรอกผิดแล้วไม่มีทางรู้ตัว → ทำเป็น "โซ่การ์ด" + ผังมองจากด้านบนที่วาดจากตัวเลขจริง
 *
 * ผังคือหัวใจ: สลับ นูน↔เว้า หรือกรอก 4 แทน 400 ตัวเลขล้วนดูไม่ออก แต่รูปพับทับตัวเอง/หดเป็นขีดเห็นทันที
 *
 * เก็บ state เป็น array (sides/joints) แล้วค่อยแบนเป็น side1W/side1P/joint1… ตอนส่งเข้าเครื่องคิด
 *   — ลบด้านกลางแล้วรอยต่อต้องยุบตาม (เคยพลาดมาแล้วกับ sideColorOvr ใน RoomComposer)
 *
 * kind 'wp' = กันสาด/กลาสเฮ้าส์ (กรอก กว้าง+ยื่น ต่อด้าน) · 'd' = จั่ว (กรอกยาวช่วง · ลึกมาจากช่อง "กว้าง" ค่าเดียวทั้งงาน)
 */
import { useMemo } from "react";
import Icon from "@/components/Icon";
import { type RoofSide, type RoofSidesValue, MAX_SIDES, MIN_SIDES, normalizeSides, removeSide, flattenSides, parseSides, planRects } from "@/lib/calculator40/roof-sides";

export { normalizeSides, removeSide, flattenSides, parseSides };
export type { RoofSide, RoofSidesValue };

function RoofPlan({ sides, joints, kind, depth }: { sides: RoofSide[]; joints: string[]; kind: "wp" | "d"; depth: number }) {
  const rects = useMemo(() => planRects(sides, joints, kind, depth), [sides, joints, kind, depth]);
  if (!rects.length) return null;
  // หา bounding box ของทุกมุมหลังหมุน แล้วย่อให้พอดีกรอบ (สูตรเดียวกับ WallElevation)
  const pts: [number, number][] = [];
  for (const r of rects) {
    const rad = (r.deg * Math.PI) / 180, c = Math.cos(rad), s = Math.sin(rad);
    for (const [dx, dy] of [[0, 0], [r.w, 0], [r.w, r.h], [0, r.h]] as [number, number][])
      pts.push([r.x + dx * c - dy * s, r.y + dx * s + dy * c]);
  }
  const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const bw = Math.max(maxX - minX, 1), bh = Math.max(maxY - minY, 1);
  const scale = Math.min(340 / bw, 190 / bh);
  const W = bw * scale + 24, H = bh * scale + 24;

  return (
    <div className="rounded-lg border border-black/5 bg-white/50 p-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 230 }} role="img" aria-label="ผังหลังคามองจากด้านบน">
        <defs>
          <pattern id="roofhatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="#c8cdd3" strokeWidth="1" />
          </pattern>
        </defs>
        <g transform={`translate(${12 - minX * scale}, ${12 - minY * scale})`}>
          {rects.map((r) => (
            <g key={r.i} transform={`translate(${r.x * scale}, ${r.y * scale}) rotate(${r.deg})`}>
              <rect x={0} y={0} width={r.w * scale} height={r.h * scale}
                fill="url(#roofhatch)" stroke="#5f6368" strokeWidth={1.2} />
              {/* ขอบฝั่งชนบ้าน = เส้นหนา (แนวที่พาดผนัง) */}
              <line x1={0} y1={0} x2={r.w * scale} y2={0} stroke="#9aa0a6" strokeWidth={2.5} />
              {r.hip && <line x1={r.w * scale} y1={0} x2={r.w * scale} y2={r.h * scale} stroke="#b45309" strokeWidth={1.5} strokeDasharray="4 3" />}
              <text x={(r.w * scale) / 2} y={(r.h * scale) / 2 + 3} fontSize="9" fill="#5f6368" textAnchor="middle">
                ด้าน {r.i + 1}
              </text>
            </g>
          ))}
        </g>
      </svg>
      <p className="text-[11px] text-ink-3 mt-1">
        ▨ ผืนหลังคา · ▬ ฝั่งชนบ้าน · ┈ ตะเข้ (มุมหัก)
        {rects.some((r) => r.run > 0) && " · ผืนที่วางแยกข้างล่าง = หลังรอยต่อ “ชนผนัง” (คนละโซ่ ไม่ได้ต่อกัน)"}
      </p>
    </div>
  );
}

// ── ตัวหลัก ────────────────────────────────────────────────────────────────
export default function RoofSidesEditor({
  kind, jointOpts, jointEnd, value, onChange, depth = 0, area,
}: {
  kind: "wp" | "d";
  jointOpts: string[];      // ตัวเลือกรอยต่อ — ส่งมาจากรุ่น ห้าม hardcode (จั่วเรียก "ติดบ้าน" ไม่ใช่ "ชนผนัง")
  jointEnd: string;         // ตัวเลือกที่แปลว่า "จบด้านนี้"
  value: RoofSidesValue;
  onChange: (v: RoofSidesValue) => void;
  depth?: number;           // จั่ว: ลึกต่อสโลป (= กว้าง/2) ใช้วาดผังอย่างเดียว
  area?: number;            // พื้นที่รวม (ตร.ม.) โชว์ให้ช่างเทียบกับที่วัดมา
}) {
  const { sides, joints } = value;
  const set = (v: RoofSidesValue) => onChange(normalizeSides(v, jointEnd));
  const setSide = (i: number, patch: Partial<RoofSide>) =>
    set({ sides: sides.map((s, k) => (k === i ? { ...s, ...patch } : s)), joints });
  const setJoint = (i: number, j: string) => set({ sides, joints: joints.map((x, k) => (k === i ? j : x)) });
  const addSide = () => {
    const last = sides[sides.length - 1] ?? { w: 300, p: 100 };
    set({ sides: [...sides, { ...last }], joints: [...joints, jointEnd] });   // ก๊อปด้านก่อนหน้า ไม่ใช่ 0 — ผังไม่พังทันทีที่กด
  };

  // เตือนแบบกดแก้ได้ ไม่ใช่แค่ข้อความ
  const warns: { msg: string; fix?: () => void }[] = [];
  sides.forEach((s, i) => {
    if (s.w > 0 && s.w < 50) warns.push({ msg: `ด้าน ${i + 1} กว้าง ${s.w} ซม. — กรอกเป็นเมตรหรือเปล่า?`, fix: () => setSide(i, { w: s.w * 100 }) });
    if (kind === "wp" && s.p > 0 && s.p < 50) warns.push({ msg: `ด้าน ${i + 1} ยื่น ${s.p} ซม. — กรอกเป็นเมตรหรือเปล่า?`, fix: () => setSide(i, { p: s.p * 100 }) });
    if (kind === "wp" && s.w > 0 && s.p > 0 && s.p > s.w) warns.push({ msg: `ด้าน ${i + 1} ยื่น (${s.p}) มากกว่ากว้าง (${s.w}) — สลับกันหรือเปล่า?`, fix: () => setSide(i, { w: s.p, p: s.w }) });
    // ไฟล์ตัดกาง "ตำแหน่งจันทัน" ได้สูงสุด 16 ตำแหน่ง/ด้าน → ด้านที่ยาวเกินราว 15 ม. จันทันท้าย ๆ หายเงียบ
    //   (ระยะจันทันแคบสุด 100 ซม. → 15 ช่วง + 1 = 16) เตือนไว้ ไม่บล็อก เพราะบางงานอาจตั้งใจซอยด้านเอง
    if (s.w > 1500) warns.push({ msg: `ด้าน ${i + 1} กว้าง ${s.w} ซม. เกิน 15 ม. — ไฟล์ตัดคิดจันทันได้แค่ 16 แนว/ด้าน ของจะขาด ให้ซอยเป็น 2 ด้าน` });
    if (s.w <= 0) warns.push({ msg: `ด้าน ${i + 1} ยังไม่ได้กรอกความกว้าง — ด้านนี้ไม่ถูกคิดราคา` });
    else if (kind === "wp" && s.p <= 0) warns.push({ msg: `ด้าน ${i + 1} ยังไม่ได้กรอกระยะยื่น — ด้านนี้จะคิดของออกมาเพี้ยน` });
  });
  // เว้าลึกเกินกว้างด้านข้างเคียง = ใบตัดคำนวณความยาวติดลบ (ของหายเงียบ)
  joints.forEach((j, i) => {
    if (j !== "เว้า") return;
    const a = sides[i], b = sides[i + 1];
    if (kind === "wp" && a && b && a.w > 0 && b.p > a.w) warns.push({ msg: `รอยต่อ ${i + 1}→${i + 2} เว้า แต่ยื่นด้าน ${i + 2} (${b.p}) ยาวกว่ากว้างด้าน ${i + 1} (${a.w}) — ของด้านนั้นจะหาย` });
  });

  const numCls = "min-h-[44px] w-full glass-soft rounded-lg px-3 py-2 outline-none tabular-nums focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand";
  const wLabel = kind === "d" ? "ยาวช่วง (ซม.)" : "กว้าง (ซม.)";

  return (
    <div className="mt-4 space-y-3 rounded-2xl glass-soft p-4">
      <div className="text-sm font-bold text-brand-dark flex items-center gap-1.5">
        🏠 ด้านหลังคา <span className="text-xs font-normal text-ink-3">(หักมุมรอบบ้าน · ได้ถึง {MAX_SIDES} ด้าน)</span>
      </div>

      <div className="sticky top-0 z-10">
        <RoofPlan sides={sides} joints={joints} kind={kind} depth={depth} />
      </div>
      <div className="text-sm font-semibold text-brand-dark tabular-nums">
        รวม {sides.filter((s) => s.w > 0).length} ด้าน{area != null && area > 0 ? ` · พื้นที่ ${area} ตร.ม.` : ""}
      </div>

      {sides.map((s, i) => (
        <div key={i}>
          <div className="rounded-xl border border-black/5 bg-white/60 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-ink-2">ด้าน {i + 1}</span>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => set({ sides: [...sides.slice(0, i + 1), { ...s }, ...sides.slice(i + 1)], joints: [...joints.slice(0, i), jointEnd, ...joints.slice(i)] })}
                  className="press text-xs text-brand flex items-center gap-1 min-h-[36px] px-2" disabled={sides.length >= MAX_SIDES}>
                  <Icon name="copy" size={13} /> ก๊อป
                </button>
                <button type="button" onClick={() => set(removeSide(value, i, jointEnd))}
                  className="press min-w-[44px] min-h-[44px] rounded-lg glass-soft text-ink-3 hover:text-red-600 flex items-center justify-center"
                  disabled={sides.length <= MIN_SIDES} aria-label={`ลบด้าน ${i + 1}`}>
                  <Icon name="trash" size={14} />
                </button>
              </div>
            </div>
            <div className={`grid ${kind === "d" ? "grid-cols-1" : "grid-cols-2"} gap-2`}>
              <label className="block">
                <span className="text-xs font-medium text-ink-3">{wLabel}</span>
                <input type="number" inputMode="numeric" step={10} value={s.w || ""} placeholder="400"
                  onChange={(e) => setSide(i, { w: +e.target.value || 0 })} className={`mt-1 ${numCls}`} />
              </label>
              {kind === "wp" && (
                <label className="block">
                  <span className="text-xs font-medium text-ink-3">ยื่น (ซม.)</span>
                  <input type="number" inputMode="numeric" step={10} value={s.p || ""} placeholder="150"
                    onChange={(e) => setSide(i, { p: +e.target.value || 0 })} className={`mt-1 ${numCls}`} />
                </label>
              )}
            </div>
          </div>
          {i < sides.length - 1 && (
            <div className="pl-4 border-l-2 border-brand/20 ml-3 py-2">
              <div className="text-xs font-medium text-ink-3 mb-1">รอยต่อ ด้าน {i + 1} → {i + 2}</div>
              <div className="flex flex-wrap gap-1.5">
                {jointOpts.map((j) => (
                  <button key={j} type="button" onClick={() => setJoint(i, j)}
                    className={`press text-xs font-semibold rounded-full px-3 py-1.5 min-h-[36px] ${joints[i] === j ? "bg-brand text-white" : "glass-soft text-ink-2"}`}>
                    {j === "นูน" ? "╮ นูน" : j === "เว้า" ? "╭ เว้า" : `▌ ${j}`}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-ink-3 mt-1">
                {joints[i] === "นูน" ? "นูน = มุมบ้านยื่นออก (หลังคาอ้อมมุมออก)"
                  : joints[i] === "เว้า" ? "เว้า = มุมหักเข้าใน (น้ำไหลลงร่องตะเข้)"
                  : `${jointEnd} = จบด้านนี้ ไม่หักมุมต่อ`}
              </p>
            </div>
          )}
        </div>
      ))}

      {sides.length < MAX_SIDES && (
        <button type="button" onClick={addSide}
          className="press text-xs font-semibold rounded-full px-3.5 py-2 glass-soft text-ink-2 hover:bg-white/70">
          ＋ เพิ่มด้าน (ก๊อปขนาดด้าน {sides.length})
        </button>
      )}

      {warns.map((w, i) => (
        <div key={i} className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
          <span>{w.msg}</span>
          {w.fix && <button type="button" onClick={w.fix} className="press shrink-0 text-xs font-semibold text-amber-900 underline">แก้ให้</button>}
        </div>
      ))}
    </div>
  );
}
