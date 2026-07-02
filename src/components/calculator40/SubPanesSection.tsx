"use client";

/**
 * ➕ ผสมบาน (sub-panes) — เพิ่มบานหลายชนิดในชุด/รายการเดียว คิดราคาตามชนิดจริง (สี/กระจกตามบานหลัก)
 * Port ตรงจาก mockup app.js บรรทัด 1296-1423 (SUB_GROUPS, subPrice, renderSubPanes, renderSubRow)
 * แบบง่าย (พี่สั่ง: "addons ย่อยเอาแบบ simplified ได้") — ไม่มี popup "ตั้งค่าบาน (G1)" เต็มรูปแบบเหมือน mockup
 * (door-picker A ที่เปิด renderConfig ของรุ่นย่อยแบบเต็ม) ใช้ทางลัด "จัดเต็ม" (มุ้ง/วัสดุเสริม/คาดตาราง) แทน
 * เหมือน app.js legacy branch (mat: frame/pleat/solid + gridmark) ซึ่งเป็นเส้นทางเดิมที่ยังใช้ subPrice ได้ตรงกับ engine
 *
 * ราคาบานย่อย = subPrice() ก๊อปตรง app.js บรรทัด 1305-1322:
 *   fprice override > computeCost(รุ่นจริง, w,h,n, form, สี/กระจกตามบานหลัก) + extra (มุ้ง/วัสดุ/คาดตาราง แบบ flat legacy)
 * ผลรวม subSell/subCost คำนวณใน Calculator40Client.tsx (เหมือน roofSegs) แล้วบวกเข้า sell ตอนขึ้นใบ
 */
// @ts-expect-error — engine เป็น ESM JS ล้วน
import { computeCost } from "@/lib/calculator40/engine.mjs";
// @ts-expect-error — products เป็น ESM JS ล้วน
import { PRODUCTS } from "@/lib/calculator40/products.mjs";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type SubPane = {
  key: number;
  pid: string; // product id หรือ '_custom'
  label: string;
  w: number; h: number; n: number; // เมตร, เมตร, จำนวนบาน
  desc?: string; price?: number; // เฉพาะ _custom
  openCt?: number; fixCt?: number; // แบ่งบาน (เฉพาะ SUB_WORKING)
  mat?: "none" | "frame" | "pleat" | "solid"; // มุ้ง/วัสดุเสริม (legacy simplified)
  gridmark?: "none" | "yes";
  note?: string;
  fprice?: number; // ราคาแยก override
  _open?: boolean; // ขยาย "ปรับ"
  _full?: boolean; // ขยาย "จัดเต็ม"
};

// 2 กลุ่มปุ่มเพิ่ม — ตรง app.js SUB_GROUPS เป๊ะ (pid, label, w, h เริ่มต้นเป็นเมตร)
export const SUB_GROUPS: { g: string; items: [string, string, number, number][] }[] = [
  { g: "บานทำงาน", items: [["open_door", "บานเปิด", 0.9, 2.2], ["sms_slide", "บานเลื่อน", 1.8, 2.2], ["folding", "เฟี้ยม", 2.4, 2.2], ["awning", "กระทุ้ง", 0.6, 0.6]] },
  { g: "ติดตาย / ช่องแสง", items: [["fixed", "ช่องแสงบน", 1.2, 0.4], ["fixed", "บานข้างติดตาย", 0.6, 2.2], ["fixed", "ช่องแสงติดตาย", 1.0, 0.5], ["_custom", "อื่นๆ (กรอกเอง)", 1.0, 1.0]] },
];
// บานที่แบ่งเปิด/ติดตายได้ (ปุ่ม "ปรับ" → แบ่งบาน)
const SUB_WORKING = ["open_door", "sms_slide", "folding", "awning"];

function fmtBaht(n: number) {
  return Math.round(n || 0).toLocaleString("th-TH");
}

// ราคาบานย่อย — ตรง app.js subPrice() เป๊ะ (ตัดทางที่ไม่รองรับในเวอร์ชัน simplified: s.opt popup ออก เหลือ legacy mat/gridmark)
export function subPrice(s: SubPane, pb: any, mainColor: string, mainGlass: string, profitPct: number): number {
  if (s.pid === "_custom") return +s.price! || 0;
  const sp = (PRODUCTS as any)[s.pid];
  if (!sp) return 0;
  const sForm = sp.defForm;
  let base = 0;
  if (s.fprice! > 0) base = +s.fprice!;
  else {
    const r: any = computeCost(pb, sp, {
      w: (s.w || 1) * 100, h: (s.h || 1) * 100, p: s.n || 1, form: sForm,
      color: mainColor, glassType: mainGlass, material: sp.defMaterial ?? undefined,
      profitPct, installProfitPct: profitPct, addons: {},
    });
    base = r.sell.withInstall;
  }
  let extra = 0;
  if (s.mat === "frame" || s.mat === "pleat") extra += 3000;
  else if (s.mat === "solid") extra += Math.ceil(((s.w || 1) * (s.h || 1) * 3500) / 100) * 100;
  if (s.gridmark === "yes") extra += 2000;
  return base + extra;
}

export function subDesc(s: SubPane): string {
  if (s.pid === "_custom") return (s.desc || "บานอื่นๆ") + " (กรอกเอง)";
  let d = `${s.label} ${s.w || 1}×${s.h || 1}ม.${(s.n || 1) > 1 ? ` ${s.n}บาน` : ""}`;
  if ((s.openCt || 0) + (s.fixCt || 0) > 0) d += ` (เปิด ${s.openCt || 0}/ติดตาย ${s.fixCt || 0})`;
  if (s.mat === "frame") d += " +มุ้งเฟรม";
  else if (s.mat === "pleat") d += " +มุ้งจีบ";
  else if (s.mat === "solid") d += " +อลูทึบ";
  if (s.gridmark === "yes") d += " +คาดตาราง";
  if (s.note) d += " · " + s.note;
  return d;
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

export default function SubPanesSection({ subs, setSubs, pb, mainColor, mainGlass, profitPct }: {
  subs: SubPane[];
  setSubs: (fn: (s: SubPane[]) => SubPane[]) => void;
  pb: any;
  mainColor: string;
  mainGlass: string;
  profitPct: number;
}) {
  function addSub(pid: string, label: string, w: number, h: number, key: number) {
    if (pid === "_custom") {
      setSubs((s) => [...s, { key, pid, label, desc: "", price: 0, w, h, n: 1 }]);
    } else {
      setSubs((s) => [...s, { key, pid, label, w, h, n: 1 }]);
    }
  }
  function patch(key: number, p: Partial<SubPane>) {
    setSubs((s) => s.map((x) => (x.key === key ? { ...x, ...p } : x)));
  }
  function remove(key: number) {
    setSubs((s) => s.filter((x) => x.key !== key));
  }

  return (
    <div className="mt-4 space-y-3 rounded-2xl glass-soft p-4">
      <div className="text-sm font-bold text-brand-dark flex items-center gap-1.5">
        ➕ ผสมบาน <span className="text-xs font-normal text-ink-3">(เพิ่มบานในชุดเดียว · กดเพิ่ม → ปรับ/จัดเต็มได้ต่อบาน)</span>
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
        const price = subPrice(s, pb, mainColor, mainGlass, profitPct);
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
                  <span className="text-sm font-semibold text-brand-dark tabular-nums">{fmtBaht(price)} ฿</span>
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

            {/* ชั้น 2: ปรับ (แบ่งบาน + หมายเหตุ) */}
            {s._open && !isCustom && (
              <div className="pl-2 border-l-2 border-brand/20 space-y-2">
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

            {/* ชั้น 3: จัดเต็ม (มุ้ง/วัสดุเสริม + คาดตาราง + ราคาแยก) */}
            {s._full && !isCustom && (
              <div className="pl-2 border-l-2 border-brand/20 space-y-2">
                <div>
                  <span className="text-xs font-medium text-ink-3">มุ้ง / วัสดุเสริม</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {[["none", "ไม่มี"], ["frame", "มุ้งเฟรม +3,000"], ["pleat", "มุ้งจีบ +3,000"], ["solid", "อลูทึบ (พื้นที่×3,500)"]].map(([v, l]) => (
                      <button key={v} type="button" onClick={() => patch(s.key, { mat: v as SubPane["mat"] })}
                        className={`press text-xs font-semibold rounded-full px-3 py-1.5 ${(s.mat || "none") === v ? "bg-brand text-white" : "glass-soft text-ink-2"}`}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="text-xs font-medium text-ink-3">คาดตาราง</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {[["none", "ไม่มี"], ["yes", "มี +2,000"]].map(([v, l]) => (
                      <button key={v} type="button" onClick={() => patch(s.key, { gridmark: v as SubPane["gridmark"] })}
                        className={`press text-xs font-semibold rounded-full px-3 py-1.5 ${(s.gridmark || "none") === v ? "bg-brand text-white" : "glass-soft text-ink-2"}`}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
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
        <p className="text-[11px] text-ink-3">บานย่อยคิดราคาตามชนิดจริง (สี/กระจกตามบานหลัก) · ขึ้นใบเป็นบรรทัดย่อยในรายการเดียว</p>
      )}
    </div>
  );
}
