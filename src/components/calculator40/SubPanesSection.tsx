"use client";

/**
 * ➕ ผสมบาน (sub-panes) — เพิ่มบานหลายชนิดในชุด/รายการเดียว คิดราคาตามชนิดจริง (สี/กระจกตามบานหลัก)
 *
 * 29 ต.ค.69 (เจ้าของสั่ง "ยังคิดเป็นตารางเมตร ไม่คิดเป็นของ · กดเพิ่มแล้วไม่ขึ้นค่าของ"):
 *   - ตัวคิด (ขาย/ทุน/ค่าแรง/รายการของ) ย้ายไป lib/calculator40/sub-pane.ts (subCalc) — ไฟล์นี้เหลือแต่ UI
 *   - "จัดเต็ม" = <AddonsSection> ของรุ่นนั้นจริง ๆ (มุ้ง R4.0 · คาดตาราง · ทึบล่าง · มือจับ ฯลฯ) ชุดเดียวกับหน้า G1/ห้องกระจก
 *     แทนปุ่มเหมา มุ้ง +3,000 / อลูทึบ ตร.ม.×3,500 / คาดตาราง +2,000 (ใบเก่าที่บันทึกแบบเหมาไว้ยังเปิดได้ราคาเดิม)
 *   - การ์ดบานย่อยโชว์ ทุนของ/ค่าแรง เมื่อเปิด 💰 ดูทุน
 */
import AddonsSection from "@/components/calculator40/AddonsSection";
import { resolveAluColor } from "@/lib/calculator40/alu-colors";
import { subCalc, subProd, subIsLegacy, SUB_GROUPS, SUB_WORKING, type SubPane } from "@/lib/calculator40/sub-pane";
import type { PaneProfit } from "@/lib/calculator40/pane-calc";
// ตัวคิด/ข้อความ export ต่อให้โค้ดเดิมที่ import จากไฟล์นี้ยังใช้ได้
export { subCalc, subPrice, subDesc, SUB_GROUPS, type SubPane } from "@/lib/calculator40/sub-pane";

/* eslint-disable @typescript-eslint/no-explicit-any */

function fmtBaht(n: number) {
  return Math.round(n || 0).toLocaleString("th-TH");
}

function NumInput({ value, onChange, placeholder, step, className }: { value: number | string; onChange: (v: number) => void; placeholder?: string; step?: number; className?: string }) {
  return (
    <input
      type="number"
      value={value === 0 ? "" : value}
      placeholder={placeholder}
      step={step}
      min={0}
      onChange={(e) => onChange(+e.target.value || 0)}
      className={className ?? "min-h-[44px] glass-soft rounded-lg px-2.5 py-2 w-20 outline-none tabular-nums text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"}
    />
  );
}

function Stepper({ value, onChange, min = 0, max = 20 }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" onClick={() => onChange(Math.max(min, (value || 0) - 1))}
        className="press min-w-[32px] min-h-[32px] rounded-lg glass-soft text-ink-2 font-bold text-sm">−</button>
      <span className="w-6 text-center text-sm tabular-nums">{value || 0}</span>
      <button type="button" onClick={() => onChange(Math.min(max, (value || 0) + 1))}
        className="press min-w-[32px] min-h-[32px] rounded-lg glass-soft text-ink-2 font-bold text-sm">+</button>
    </div>
  );
}

export default function SubPanesSection({ subs, setSubs, pb, mainColor, mainGlass, profitPct, profitOpt, laborMode = "all", showCost = false }: {
  subs: SubPane[];
  setSubs: (fn: (s: SubPane[]) => SubPane[]) => void;
  pb: any;
  mainColor: string;
  mainGlass: string;
  profitPct: number;
  /** กำไร 3 ก้อนแยก + โหมดกรอกเอง (เดิมส่งแต่ profitPct ตัวเดียว — ช่องค่าผลิต/ติดตั้งจึงไม่มีผล) */
  profitOpt?: PaneProfit;
  /** ขายส่ง (ผลิตอย่างเดียว) — ราคาบานย่อยต้องเป็นยอดเดียวกับบานหลัก */
  laborMode?: "all" | "mfg";
  /** เปิด 💰 ดูทุน → โชว์ทุนของ/ค่าแรงของบานย่อยด้วย */
  showCost?: boolean;
}) {
  function addSub(pid: string, label: string, w: number, h: number, key: number) {
    if (pid === "_custom") {
      setSubs((s) => [...s, { key, pid, label, desc: "", price: 0, w, h, n: 1 }]);
    } else {
      setSubs((s) => [...s, { key, pid, label, w, h, n: 1, addons: {} }]);
    }
  }
  function patch(key: number, p: Partial<SubPane>) {
    setSubs((s) => s.map((x) => (x.key === key ? { ...x, ...p } : x)));
  }
  function remove(key: number) {
    setSubs((s) => s.filter((x) => x.key !== key));
  }
  const rc = resolveAluColor(mainColor);

  return (
    <div className="mt-4 space-y-3 rounded-2xl glass-soft p-4">
      <div className="text-sm font-bold text-brand-dark flex items-center gap-1.5">
        ➕ ผสมบาน <span className="text-xs font-normal text-ink-3">(เพิ่มบานในชุดเดียว · กดเพิ่ม → ปรับ/จัดเต็มได้ต่อบาน · คิดจากของจริงเหมือนบานหลัก)</span>
      </div>
      {SUB_GROUPS.map((grp) => (
        <div key={grp.g} className="space-y-1.5">
          <div className="text-xs font-semibold text-ink-3">{grp.g}</div>
          <div className="flex flex-wrap gap-1.5">
            {grp.items.map(([pid, label, w, h]) => (
              <button
                key={label}
                type="button"
                onClick={() => addSub(pid, label, w, h, Date.now() + Math.random())}
                className="press text-xs font-semibold rounded-full px-3 py-1.5 glass-soft text-ink-2 hover:bg-white/70"
              >
                ＋ {label}
              </button>
            ))}
          </div>
        </div>
      ))}

      {subs.map((s) => {
        const isCustom = s.pid === "_custom";
        const c = subCalc(s, pb, mainColor, mainGlass, profitPct, profitOpt, laborMode);
        const prod = isCustom ? null : subProd(s.pid);
        const legacy = subIsLegacy(s);
        return (
          <div key={s.key} className="rounded-xl border border-black/5 bg-white/60 p-3 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-ink-2 min-w-[90px]">{s.label}</span>
              {isCustom ? (
                <>
                  <input type="text" placeholder="ชื่อบาน" value={s.desc || ""}
                    onChange={(e) => patch(s.key, { desc: e.target.value })}
                    className="min-h-[44px] glass-soft rounded-lg px-2.5 py-2 flex-1 min-w-[120px] outline-none text-sm" />
                  <NumInput value={s.price || 0} onChange={(v) => patch(s.key, { price: v })} placeholder="ราคา" />
                </>
              ) : (
                <>
                  <NumInput value={s.w} onChange={(v) => patch(s.key, { w: v })} placeholder="กว้าง(ม.)" step={0.1} />
                  <NumInput value={s.h} onChange={(v) => patch(s.key, { h: v })} placeholder="สูง(ม.)" step={0.1} />
                  <NumInput value={s.n || 1} onChange={(v) => patch(s.key, { n: Math.max(1, Math.round(v)) })} placeholder="บาน" />
                  <span className="text-sm font-semibold text-brand-dark tabular-nums">{fmtBaht(c.amount)} ฿</span>
                  {s.fprice! > 0 && <span className="text-[11px] text-amber-700">ราคาแยก</span>}
                </>
              )}
              <button type="button" onClick={() => patch(s.key, { _open: !s._open })}
                className="press text-xs font-semibold glass-soft rounded-lg px-2.5 py-1.5 text-ink-2">
                {s._open ? "ปรับ ▴" : "ปรับ ▾"}
              </button>
              {!isCustom && (
                <button type="button" onClick={() => patch(s.key, { _full: !s._full })}
                  className="press text-xs font-semibold glass-soft rounded-lg px-2.5 py-1.5 text-ink-2">
                  {s._full ? "จัดเต็ม ▴" : "จัดเต็ม ▾"}
                </button>
              )}
              <button type="button" onClick={() => remove(s.key)} className="press text-ink-3 hover:text-red-600 ml-auto">✕</button>
            </div>
            {/* ทุนบานย่อย — ของจริงจาก BOM (เปิด 💰 ดูทุน) */}
            {showCost && !isCustom && (
              <div className="text-[11px] text-ink-3 tabular-nums">
                ทุนของ ฿{fmtBaht(c.cost)} · ค่าผลิต ฿{fmtBaht(c.labor.prod)}{laborMode === "mfg" ? "" : ` · ค่าติดตั้ง ฿${fmtBaht(c.labor.install)}`} · ของ {c.lines.length} รายการ (ดูในตาราง &quot;ค่าของ&quot; ของชุดนี้)
              </div>
            )}

            {/* ชั้น 2: ปรับ (รูปแบบ + แบ่งบาน + หมายเหตุ) */}
            {s._open && !isCustom && (
              <div className="pl-2 border-l-2 border-brand/20 space-y-2">
                {/* รูปแบบบานนี้ (ต่างจากบานหลักได้) — เฉพาะชนิดที่มีหลายรูปแบบ */}
                {(() => {
                  const forms: string[] = prod?.forms ?? [];
                  if (forms.length <= 1) return null;
                  return (
                    <label className="flex items-center gap-2">
                      <span className="text-xs font-medium text-ink-3 min-w-[52px]">รูปแบบ:</span>
                      <select value={s.form || prod.defForm || forms[0]} onChange={(e) => patch(s.key, { form: e.target.value })}
                        className="min-h-[40px] glass-soft rounded-lg px-2.5 py-1.5 outline-none text-sm flex-1">
                        {forms.map((f) => <option key={f} value={f}>{f}</option>)}
                      </select>
                    </label>
                  );
                })()}
                {SUB_WORKING.includes(s.pid) && (
                  <div className="flex items-center gap-4">
                    <span className="text-xs font-medium text-ink-3">แบ่งบาน:</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-ink-3">เปิด</span>
                      <Stepper value={s.openCt || 0} onChange={(v) => patch(s.key, { openCt: v })} />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-ink-3">ติดตาย</span>
                      <Stepper value={s.fixCt || 0} onChange={(v) => patch(s.key, { fixCt: v })} />
                    </div>
                  </div>
                )}
                <input type="text" placeholder="หมายเหตุบานนี้ (เช่น เปิดออกนอก / ต่อเปลือยข้าง)" value={s.note || ""}
                  onChange={(e) => patch(s.key, { note: e.target.value })}
                  className="w-full min-h-[44px] glass-soft rounded-lg px-3 py-2 outline-none text-sm" />
              </div>
            )}

            {/* ชั้น 3: จัดเต็ม = ของเสริมจริงของรุ่นนี้ (ชุดเดียวกับหน้า G1) + ราคาแยก */}
            {s._full && !isCustom && (
              <div className="pl-2 border-l-2 border-brand/20 space-y-2">
                {legacy && (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] text-amber-800 flex items-center gap-2 flex-wrap">
                    <span>
                      ใบเก่า: คิดของเสริมแบบเหมา ({s.mat === "frame" ? "มุ้งเฟรม +3,000" : s.mat === "pleat" ? "มุ้งจีบ +3,000" : s.mat === "solid" ? "อลูทึบ ตร.ม.×3,500" : ""}{s.gridmark === "yes" ? " คาดตาราง +2,000" : ""}) — กดล้างเพื่อเลือกของเสริมจากของจริงแทน
                    </span>
                    <button type="button" onClick={() => patch(s.key, { mat: "none", gridmark: "none", addons: {} })}
                      className="press text-[11px] font-semibold rounded-lg px-2 py-1 bg-white border border-amber-300">ล้าง</button>
                  </div>
                )}
                {prod && (prod.addons || []).length > 0 ? (
                  <AddonsSection
                    prod={prod}
                    addons={s.addons || {}}
                    setAddons={(fn) => patch(s.key, { addons: fn(s.addons || {}), mat: "none", gridmark: "none" })}
                    area={(s.w || 1) * (s.h || 1)}
                    W={s.w || 1}
                    size={{ W: s.w || 1, H: s.h || 1, P: s.n || 1 }}
                    movePanes={Math.max(1, (s.n || 1) - (s.fixCt || 0))}
                    color={rc.bake}
                    colorKey={mainColor}
                    form={s.form || prod.defForm}
                  />
                ) : (
                  <p className="text-[11px] text-ink-3">รุ่นนี้ไม่มีของเสริมให้เลือก</p>
                )}
                <label className="block">
                  <span className="text-xs font-medium text-ink-3">ราคาแยก (override · เว้น=คิดตามชนิด)</span>
                  <NumInput value={s.fprice || 0} onChange={(v) => patch(s.key, { fprice: v })} placeholder="บาท" className="w-full min-h-[44px] glass-soft rounded-lg px-3 py-2 mt-1 outline-none tabular-nums text-sm" />
                </label>
              </div>
            )}
          </div>
        );
      })}
      {subs.length > 0 && (
        <p className="text-[11px] text-ink-3">บานย่อยถอดของจริงตามชนิด (สี/กระจกตามบานหลัก) · ราคา/ทุน/ของ รวมเข้ากับบานหลัก · ขึ้นใบเป็นบรรทัดย่อยในรายการเดียว</p>
      )}
    </div>
  );
}
