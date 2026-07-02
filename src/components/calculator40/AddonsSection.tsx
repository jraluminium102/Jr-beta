"use client";

/**
 * ของเสริม (add-ons) — คิดราคา 4.0
 * Port ตรงจาก mockup R4.0 (app.js บรรทัด ~1740-2130, การจัดกลุ่ม ~1033-1040)
 * แต่ละ addon เก็บค่าใน state `addons: Record<string, any>` ส่งเข้า computeCost เป็น opt.addons[id]
 * sel shape ต้องตรงกับที่ engine.mjs `computeAddon(id, sel, ctx)` คาดหวังเป๊ะ — ห้ามเดา/แก้ shape เอง
 *
 * addon id ที่ engine รู้จักแต่ไม่มี product ใดประกาศใน prod.addons (products.mjs) ปัจจุบัน — ไม่ต้องทำ UI
 * เพราะไม่มีทางถูก render (เช่น cmech, stainless, digihandle, motor, slide_auto, grid, closer, thresh,
 * hide_track, inner_track, solid_panel, soft_close, sling, u_track, beam_support, hide_beam, drop_floor,
 * awn_auto, awn_tt, awn_brace, banklet_motor) — ของเดิม G1 บางรุ่น (open_door, awning, sms_slide ฯลฯ)
 * ยังไม่ประกาศ addons ในไฟล์ products.mjs เวอร์ชันนี้ ถ้าอนาคตเพิ่ม addons ให้รุ่นเหล่านั้น ค่อยเติม UI ตรงนี้
 */

import { fmt } from "@/lib/calculator40/fmt";
// @ts-expect-error — mosquito helper เป็น ESM JS ล้วน
import { MOSQ_CHIPS, mosqVariants } from "@/lib/calculator40/mosquito.mjs";
// @ts-expect-error — products เป็น ESM JS ล้วน (ใช้ดึง screen_ready.materials สำหรับรุ่นย่อยมุ้ง)
import { PRODUCTS } from "@/lib/calculator40/products.mjs";

/* eslint-disable @typescript-eslint/no-explicit-any */

type AddonsMap = Record<string, any>;

const ADDON_FLAT: Record<string, number> = {
  soft_close: 4000, sling: 2000, hide_beam: 4000, u_track: 4000, beam_support: 4000,
  hide_track: 4000, gate_curve: 4000, shower_black: 4000, shower_gold: 6000,
};
const CEIL_RATE: Record<string, number> = {
  "ฉาบเรียบ": 480, "อลูตัวซี": 2100, "อลูไทยทิพย์": 2100,
  "ไม้เทียม remood": 2600, "ระแนงอลู 1×5": 3300, "ระแนงอลู เว้นร่อง": 3700,
};

// ── กลุ่มออปชั่นเสริม → จัดเข้าหมวด (แค่จัดหน้า ไม่กระทบราคา/engine) — ตรง app.js OPENING/HANDLE/SCREEN/MAIN_EXTRA/AUTO_ADDONS ──
const OPENING_ADDONS = ["closer", "thresh", "hide_track", "inner_track", "motor", "awn_tt", "awn_brace"];
const HANDLE_ADDONS = ["cmech", "stainless", "digihandle"];
const SCREEN_ADDONS = ["mosquito", "zip_motor", "zip_noremote", "zip_smart", "zip_remote"];
const MAIN_EXTRA_ADDONS = ["grid", "solid_panel", "shower_corner", "shower_hw"];
const AUTO_ADDONS = ["slide_motor", "slide_auto", "awn_auto", "banklet_motor"];

function addonsIn(prodAddons: string[], ids: string[]) {
  return prodAddons.filter((a) => ids.includes(a));
}
function addonsRest(prodAddons: string[]) {
  const used = [...OPENING_ADDONS, ...HANDLE_ADDONS, ...SCREEN_ADDONS, ...MAIN_EXTRA_ADDONS, ...AUTO_ADDONS];
  return prodAddons.filter((a) => !used.includes(a));
}

/* ── primitives (glassmorphism ตาม token หน้าปัจจุบัน) ── */
function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`press min-h-[38px] rounded-full px-3.5 py-2 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand ${
        active ? "bg-brand text-white shadow-brand" : "glass-soft text-ink-2 hover:bg-white/70"
      }`}
    >
      {label}
    </button>
  );
}
function ChipRow({ items, value, onChange }: { items: { val: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((it) => (
        <Chip key={it.val} label={it.label} active={it.val === value} onClick={() => onChange(it.val)} />
      ))}
    </div>
  );
}
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-ink-3">
        {label} {hint && <span className="text-ink-3/70 font-normal">{hint}</span>}
      </span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}
function NumberInput({ value, onChange, placeholder, step }: { value: number | string; onChange: (v: number) => void; placeholder?: string; step?: number }) {
  return (
    <input
      type="number"
      value={value === 0 ? "" : value}
      placeholder={placeholder ?? "0"}
      step={step}
      min={0}
      onChange={(e) => onChange(+e.target.value || 0)}
      className="w-full min-h-[44px] glass-soft rounded-lg px-3 py-2 outline-none tabular-nums focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
    />
  );
}
function SectionHeader({ icon, label }: { icon: string; label: string }) {
  return <div className="text-xs font-bold text-brand-dark mt-1 flex items-center gap-1.5">{icon} {label}</div>;
}

/* ── field ต่อ addon 1 ตัว — ตรง app.js renderAddonField เป๊ะทีละ branch ── */
function AddonField({ ad, prod, addons, setAddons, area, W, movePanes }: {
  ad: string; prod: any; addons: AddonsMap; setAddons: (fn: (a: AddonsMap) => AddonsMap) => void; area: number; W: number; movePanes: number;
}) {
  const A = addons;
  const set = (k: string, v: any) => setAddons((old) => ({ ...old, [k]: v }));
  const setObj = (k: string, patch: any) => setAddons((old) => ({ ...old, [k]: { ...(old[k] || {}), ...patch } }));

  if (ad === "frame_wrap") {
    return (
      <Field label="ครอบวงกบอลู">
        <ChipRow items={[{ val: "none", label: "ไม่มี" }, { val: "3", label: "3 ด้าน" }, { val: "4", label: "4 ด้าน" }]} value={A.frame_wrap || "none"} onChange={(v) => set("frame_wrap", v)} />
      </Field>
    );
  }
  if (ad === "handrail_grip") {
    return (
      <Field label="ราวจับด้านบน">
        <ChipRow items={[{ val: "none", label: "ไม่มี" }, { val: "u5", label: 'ยู 5 หุน (+500/ม.)' }, { val: "box", label: 'กล่อง 1"×2" (+600/ม.)' }]} value={A.handrail_grip || "none"} onChange={(v) => set("handrail_grip", v)} />
      </Field>
    );
  }
  if (ad === "zip_motor") {
    const Z = prod.zip;
    if (!Z || !Z.motor) return null;
    return (
      <Field label="มอเตอร์">
        <select
          value={A.zip_motor || ""}
          onChange={(e) => set("zip_motor", e.target.value)}
          className="w-full min-h-[44px] glass-soft rounded-lg px-3 py-2 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
        >
          <option value="">— อัตโนมัติ (ตามรุ่น) —</option>
          {Object.keys(Z.motor).map((k) => (
            <option key={k} value={k}>{(Z.motorLabel?.[k] || k) + " · " + fmt(Z.motor[k])}</option>
          ))}
        </select>
      </Field>
    );
  }
  if (ad === "zip_noremote") {
    return (
      <Field label="รีโมทในชุด">
        <ChipRow items={[{ val: "none", label: "มีรีโมท 1 ตัว" }, { val: "yes", label: "ไม่เอารีโมท (−)" }]} value={A.zip_noremote || "none"} onChange={(v) => set("zip_noremote", v)} />
      </Field>
    );
  }
  if (ad === "zip_smart") {
    return (
      <Field label="Smart Module (Wi-Fi/เสียง)">
        <ChipRow items={[{ val: "none", label: "ไม่มี" }, { val: "yes", label: "มี (+800)" }]} value={A.zip_smart || "none"} onChange={(v) => set("zip_smart", v)} />
      </Field>
    );
  }
  if (ad === "zip_remote") {
    return (
      <Field label="รีโมทเพิ่ม (ตัว)">
        <NumberInput value={A.zip_remote || 0} onChange={(v) => set("zip_remote", v)} />
      </Field>
    );
  }
  if (ad === "pullrod") {
    return (
      <Field label="ก้านดึงมือ" hint="(สำรองไฟดับ · 250/ชุด)">
        <NumberInput value={A.pullrod || 0} onChange={(v) => set("pullrod", v)} />
      </Field>
    );
  }
  if (ad === "mosquito") {
    // ตรง app.js renderMosqDetails (~1640-1691) — คิดราคาจริง R4.0 ผ่าน computeMosquitoR4 (เรียกใน Calculator40Client)
    const mq = A.mosquito || "none";
    const isFrame = mq === "small" || mq === "big";
    const fabrics: [string, string][] = [["fiber", "ไฟเบอร์ (ดำ/เทา)"], ["cat", "กันแมว (ขาว)"], ["rat", "กันหนู สแตนเลส"]];
    if (mq === "big") fabrics.push(["safety", "นิรภัย 304 (ดำ)"]); // R3.9: นิรภัยเฉพาะเฟรมใหญ่
    const vars: string[] = (mq !== "none" && !isFrame) ? mosqVariants(PRODUCTS, mq) : [];
    return (
      <Field label="มุ้งบวกบาน">
        <div className="space-y-2.5">
          <ChipRow items={MOSQ_CHIPS} value={mq} onChange={(v) => set("mosquito", v)} />
          {mq !== "none" && isFrame && (
            <Field label="ผ้ามุ้ง" hint="(เลือกตามเฟรม)">
              <ChipRow items={fabrics.map(([val, label]) => ({ val, label }))} value={A.mqFabric || "fiber"} onChange={(v) => set("mqFabric", v)} />
            </Field>
          )}
          {mq !== "none" && !isFrame && vars.length > 0 && (
            <Field label="รุ่นมุ้ง" hint="(รุ่นจริง G5 · มีผลกับราคา)">
              <select
                value={A.mqVariant || vars[0]}
                onChange={(e) => set("mqVariant", e.target.value)}
                className="w-full min-h-[44px] glass-soft rounded-lg px-3 py-2 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
              >
                {vars.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </Field>
          )}
          {mq !== "none" && (
            <>
              <Field label="ขนาดมุ้ง">
                <ChipRow items={[{ val: "auto", label: "เท่าบานกระจก (auto)" }, { val: "custom", label: "กรอกเอง" }]} value={A.mqSize || "auto"} onChange={(v) => set("mqSize", v)} />
              </Field>
              {A.mqSize === "custom" && (
                <div className="grid grid-cols-2 gap-2">
                  <NumberInput value={A.mqW || 0} onChange={(v) => set("mqW", v)} placeholder="กว้าง (ม.)" step={0.1} />
                  <NumberInput value={A.mqH || 0} onChange={(v) => set("mqH", v)} placeholder="ยาว (ม.)" step={0.1} />
                </div>
              )}
              <Field label="จำนวนบานมุ้ง" hint={`(ราคา×จำนวน · default บานกระจก ${movePanes})`}>
                <NumberInput value={A.mqPanels || movePanes} onChange={(v) => set("mqPanels", Math.max(1, Math.round(v)))} />
              </Field>
              <Field label="สีกรอบมุ้ง" hint="(พิมพ์ลงใบ)">
                <ChipRow
                  items={[{ val: "", label: "ตามสีบาน" }, { val: "เทาซาฮาร่า", label: "เทาซาฮาร่า" }, { val: "KL อบพิเศษ", label: "KL อบพิเศษ" }, { val: "KL ลายไม้", label: "KL ลายไม้" }]}
                  value={A.mqFrameColor || ""}
                  onChange={(v) => set("mqFrameColor", v)}
                />
              </Field>
              <Field label="ราคามุ้งกรอกเอง" hint="(เว้น=คำนวณอัตโนมัติ)">
                <NumberInput value={A.mqPrice || 0} onChange={(v) => set("mqPrice", v)} placeholder="อัตโนมัติ" step={100} />
              </Field>
              {mq === "roll" && (() => {
                const wM = A.mqSize === "custom" ? (+A.mqW || 0) : W;
                return wM > 6 ? <p className="text-[11px] text-amber-700">มุ้งม้วนเตะกว้างเกิน 6 ม. — ต้องแบ่งชุด/เปลี่ยนรุ่น (เช็คซ้ำ)</p> : null;
              })()}
            </>
          )}
        </div>
      </Field>
    );
  }
  if (ad === "gutter") {
    const g = A.gutter || { rate: 0, len: 0 };
    return (
      <Field label="รางน้ำ" hint="(ว่าง = กว้างหลังคา)">
        <div className="space-y-2">
          <ChipRow
            items={[{ val: "0", label: "ไม่มี" }, { val: "1000", label: "อลู S · 1,000/ม." }, { val: "2000", label: "อลูมิเนียม M · 2,000/ม." }, { val: "3000", label: "สแตนเลส · 3,000/ม." }]}
            value={String(g.rate || 0)}
            onChange={(v) => setObj("gutter", { rate: +v })}
          />
          <NumberInput value={g.len || 0} onChange={(v) => setObj("gutter", { len: v })} placeholder="ยาว (ม.)" step={0.1} />
        </div>
      </Field>
    );
  }
  if (ad === "chain_drain") {
    return (
      <Field label="โซ่รางน้ำ" hint="(3,000/เส้น)">
        <NumberInput value={A.chain_drain || 0} onChange={(v) => set("chain_drain", Math.max(0, Math.round(v)))} placeholder="จำนวนเส้น" />
      </Field>
    );
  }
  if (ad === "pipe_cover") {
    return (
      <Field label="ครอบท่อ PVC" hint="(1,500/1.5ม. · ปัดขึ้น)">
        <NumberInput value={A.pipe_cover || 0} onChange={(v) => set("pipe_cover", v)} placeholder="ยาว (ม.)" step={0.1} />
      </Field>
    );
  }
  if (ad === "gutter_cover") {
    const g = A.gutter_cover || { gw: 0, gh: 10, gll: 0 };
    return (
      <Field label="ปิดซ่อนรางน้ำ (ลูกฟูก)">
        <div className="grid grid-cols-3 gap-2">
          <NumberInput value={g.gw || 0} onChange={(v) => setObj("gutter_cover", { gw: v })} placeholder="กว้างราง (ซม.)" step={0.1} />
          <NumberInput value={g.gh || 0} onChange={(v) => setObj("gutter_cover", { gh: v })} placeholder="สูง (ซม.)" step={0.1} />
          <NumberInput value={g.gll || 0} onChange={(v) => setObj("gutter_cover", { gll: v })} placeholder="ยาวรวม (ม.)" step={0.1} />
        </div>
      </Field>
    );
  }
  if (ad === "hide_slope") {
    const g = A.hide_slope || { type: "none", h: 0, l: 0, n: 1 };
    return (
      <Field label="ซ่อนสโลป">
        <div className="space-y-2">
          <ChipRow items={[{ val: "none", label: "ไม่มี" }, { val: "comp", label: "คอมโพสิต 3มม." }, { val: "smart", label: "สมาร์ทบอร์ด 6มม." }]} value={g.type || "none"} onChange={(v) => setObj("hide_slope", { type: v })} />
          {g.type && g.type !== "none" && (
            <div className="grid grid-cols-3 gap-2">
              <NumberInput value={g.h || 0} onChange={(v) => setObj("hide_slope", { h: v })} placeholder="สูง (ม.)" step={0.1} />
              <NumberInput value={g.l || 0} onChange={(v) => setObj("hide_slope", { l: v })} placeholder="ยาว/ด้าน (ม.)" step={0.1} />
              <NumberInput value={g.n ?? 1} onChange={(v) => setObj("hide_slope", { n: v })} placeholder="จำนวนด้าน" step={1} />
            </div>
          )}
        </div>
      </Field>
    );
  }
  if (ad === "gate_curve") {
    return (
      <Field label="ลักษณะบาน/ราง" hint="(เลือกก่อน)">
        <ChipRow items={[{ val: "none", label: "บานตรง (รางตรง)" }, { val: "yes", label: `บานโค้ง (รางโค้ง · +${fmt(ADDON_FLAT.gate_curve)}/บาน)` }]} value={A.gate_curve || "none"} onChange={(v) => set("gate_curve", v)} />
      </Field>
    );
  }
  if (ad === "gate_motor") {
    return (
      <Field label="มอเตอร์เพิ่ม" hint="(ชุดรวม 1 ตัวแล้ว · เพิ่ม ×16,000)">
        <NumberInput value={A.gate_motor || 0} onChange={(v) => set("gate_motor", Math.max(0, Math.round(v)))} placeholder="จำนวนเพิ่ม" />
      </Field>
    );
  }
  if (ad === "gate_wire") {
    return (
      <Field label="เดินสายไฟ/ระบบไฟ" hint="(กรอกราคา · X)">
        <NumberInput value={A.gate_wire || 0} onChange={(v) => set("gate_wire", v)} placeholder="บาท (รอราคา)" />
      </Field>
    );
  }
  if (ad === "ms_color") {
    return (
      <Field label="สีกรอบมุ้ง">
        <ChipRow items={[{ val: "none", label: "สีมาตรฐาน" }, { val: "สีพิเศษ", label: "สีพิเศษ" }]} value={A.ms_color || "none"} onChange={(v) => set("ms_color", v)} />
        {A.ms_color && A.ms_color !== "none" && (
          <p className="text-[11px] text-amber-700 mt-1">รอกรอกเรต/ตร.ม. ใน Excel — สูตรพร้อมคิดทันที</p>
        )}
      </Field>
    );
  }
  if (ad === "solid_panel") {
    const g = A.solid_panel || { type: "none", w: 0, h: 0.8 };
    return (
      <Field label="แผ่นทึบล่าง" hint="(อลูลูกฟูก/คอมโพสิต)">
        <div className="space-y-2">
          <ChipRow items={[{ val: "none", label: "ไม่มี" }, { val: "corr", label: "อลูลูกฟูก 3,500/ตร.ม." }, { val: "comp", label: "คอมโพสิต 3,300/ตร.ม." }]} value={g.type || "none"} onChange={(v) => setObj("solid_panel", { type: v })} />
          {g.type && g.type !== "none" && (
            <div className="grid grid-cols-2 gap-2">
              <NumberInput value={g.w || 0} onChange={(v) => setObj("solid_panel", { w: v })} placeholder="กว้าง (ม. ว่าง=กว้างบาน)" step={0.1} />
              <NumberInput value={g.h ?? 0.8} onChange={(v) => setObj("solid_panel", { h: v })} placeholder="สูงแผ่นล่าง (ม.)" step={0.1} />
            </div>
          )}
        </div>
      </Field>
    );
  }
  if (ad === "soft_close") {
    return (
      <Field label="Soft Close (หน่วงบาน)">
        <ChipRow items={[{ val: "none", label: "ไม่มี" }, { val: "yes", label: `มี (+${fmt(ADDON_FLAT.soft_close)})` }]} value={A.soft_close || "none"} onChange={(v) => set("soft_close", v)} />
      </Field>
    );
  }
  if (ad === "sling") {
    return (
      <Field label="สลิงเปิดซ้อน">
        <ChipRow items={[{ val: "none", label: "ไม่มี" }, { val: "yes", label: `มี (+${fmt(ADDON_FLAT.sling)}/บาน)` }]} value={A.sling || "none"} onChange={(v) => set("sling", v)} />
      </Field>
    );
  }
  if (ad === "hide_beam") {
    return (
      <Field label="ซ่อนคาน">
        <ChipRow items={[{ val: "none", label: "ไม่มี" }, { val: "yes", label: `ซ่อนคาน (+${fmt(ADDON_FLAT.hide_beam)} · ฟรี ≤3ม.)` }]} value={A.hide_beam || "none"} onChange={(v) => set("hide_beam", v)} />
      </Field>
    );
  }
  if (ad === "u_track") {
    return (
      <Field label="ฝังรางยู (U-Track)">
        <ChipRow items={[{ val: "none", label: "ไม่มี" }, { val: "yes", label: `ฝังรางยู (+${fmt(ADDON_FLAT.u_track)} · ฟรี ≤2ม.)` }]} value={A.u_track || "none"} onChange={(v) => set("u_track", v)} />
      </Field>
    );
  }
  if (ad === "beam_support") {
    return (
      <Field label="เสริมคานซัพพอร์ท">
        <ChipRow items={[{ val: "none", label: "ไม่มี" }, { val: "yes", label: `เสริมคาน (+${fmt(ADDON_FLAT.beam_support)} · ฟรี ≤3ม.)` }]} value={A.beam_support || "none"} onChange={(v) => set("beam_support", v)} />
      </Field>
    );
  }
  if (ad === "demolish") {
    return (
      <Field label="รื้อของเดิม" hint="(กรอกราคา)">
        <NumberInput value={A.demolish || 0} onChange={(v) => set("demolish", v)} placeholder="บาท" />
      </Field>
    );
  }
  if (ad === "shower_corner") {
    return (
      <Field label="เข้ามุม (L-shape)" hint="(+3,000)">
        <ChipRow items={[{ val: "none", label: "ไม่" }, { val: "yes", label: "เข้ามุม (+3,000)" }]} value={A.shower_corner || "none"} onChange={(v) => set("shower_corner", v)} />
      </Field>
    );
  }
  if (ad === "shower_hw") {
    return (
      <Field label="อุปกรณ์ราว/บานพับ (สี)">
        <ChipRow
          items={[{ val: "silver", label: "เงิน (ฟรี)" }, { val: "black", label: `ดำ (+${fmt(ADDON_FLAT.shower_black)})` }, { val: "gold", label: `ทอง (+${fmt(ADDON_FLAT.shower_gold)})` }]}
          value={A.shower_hw || "silver"}
          onChange={(v) => set("shower_hw", v)}
        />
      </Field>
    );
  }
  if (ad === "drop_floor") {
    return (
      <Field label="ดรอปพื้น" hint="(กรอกราคา · X)">
        <NumberInput value={A.drop_floor || 0} onChange={(v) => set("drop_floor", v)} placeholder="บาท (รอราคา)" />
      </Field>
    );
  }
  if (ad === "screen_demo") {
    return (
      <Field label="รื้อมุ้งเดิม" hint="(1,000)">
        <ChipRow items={[{ val: "none", label: "ไม่เอา" }, { val: "yes", label: "รื้อ (+1,000)" }]} value={A.screen_demo || "none"} onChange={(v) => set("screen_demo", v === "yes" ? "yes" : "none")} />
      </Field>
    );
  }
  if (ad === "screen_existing") {
    return (
      <Field label="ติดบานเดิม (เสริมกล่อง/ราง)" hint="(กรอกราคา · X)">
        <NumberInput value={A.screen_existing || 0} onChange={(v) => set("screen_existing", v)} placeholder="บาท (รอราคา)" />
      </Field>
    );
  }
  if (ad === "roof_pole") {
    const g = A.roof_pole || { polep: 0, pole4: 0, pole15: 0 };
    return (
      <Field label="เสา" hint="(จำนวนต้น)">
        <div className="grid grid-cols-3 gap-2">
          <NumberInput value={g.polep || 0} onChange={(v) => setObj("roof_pole", { polep: v })} placeholder="แผง ×4,000" />
          <NumberInput value={g.pole4 || 0} onChange={(v) => setObj("roof_pole", { pole4: v })} placeholder={'4"×8" ×2,000'} />
          <NumberInput value={g.pole15 || 0} onChange={(v) => setObj("roof_pole", { pole15: v })} placeholder="กลม ×1,500" />
        </div>
      </Field>
    );
  }
  if (ad === "truss_beam") {
    const g = A.truss_beam || { rate: 0, len: 0 };
    return (
      <Field label="คานเหล็กถัก">
        <div className="space-y-2">
          <ChipRow
            items={[{ val: "0", label: "ไม่มี" }, { val: "2400", label: "รุ่น1 20ซม. 2,400/ม." }, { val: "3600", label: "รุ่น2 30ซม. 3,600/ม." }, { val: "4400", label: "รุ่น3 50ซม. 4,400/ม." }]}
            value={String(g.rate || 0)}
            onChange={(v) => setObj("truss_beam", { rate: +v })}
          />
          {g.rate > 0 && <NumberInput value={g.len || 0} onChange={(v) => setObj("truss_beam", { len: v })} placeholder="ยาว (ม.)" step={0.1} />}
        </div>
      </Field>
    );
  }
  if (ad === "roof_eave") {
    const g = A.roof_eave || { on: false, len: 0 };
    return (
      <Field label="ปลายหลังคา">
        <div className="space-y-2">
          <ChipRow items={[{ val: "no", label: "ปล่อย / มีรางน้ำ" }, { val: "yes", label: "ปิดปลายกันน้ำ 1,000/ม." }]} value={g.on ? "yes" : "no"} onChange={(v) => setObj("roof_eave", { on: v === "yes" })} />
          {g.on && <NumberInput value={g.len || 0} onChange={(v) => setObj("roof_eave", { len: v })} placeholder="ยาว (ม. ว่าง=ด้านยาว)" step={0.1} />}
        </div>
      </Field>
    );
  }
  if (ad === "beam_cover") {
    const g = A.beam_cover || { on: false, bcw: 0, bcl: 0 };
    return (
      <Field label="ครอบคาน" hint="(ลูกฟูก ลด 40%)">
        <div className="space-y-2">
          <ChipRow items={[{ val: "no", label: "ไม่มี" }, { val: "yes", label: "มีงานครอบคาน" }]} value={g.on ? "yes" : "no"} onChange={(v) => setObj("beam_cover", { on: v === "yes" })} />
          {g.on && (
            <div className="grid grid-cols-2 gap-2">
              <NumberInput value={g.bcw || 0} onChange={(v) => setObj("beam_cover", { bcw: v })} placeholder="กว้างห่อ (ม.)" step={0.1} />
              <NumberInput value={g.bcl || 0} onChange={(v) => setObj("beam_cover", { bcl: v })} placeholder="ยาวคาน (ม.)" step={0.1} />
            </div>
          )}
        </div>
      </Field>
    );
  }
  if (ad === "roof_sealer") {
    const g = A.roof_sealer || { on: false, len: 0 };
    return (
      <Field label="วัสดุปิดรอยต่อหลังคา">
        <div className="space-y-2">
          <ChipRow items={[{ val: "no", label: "ไม่มี" }, { val: "yes", label: "มี (ขั้นต่ำ 5,000 · 800/ม.)" }]} value={g.on ? "yes" : "no"} onChange={(v) => setObj("roof_sealer", { on: v === "yes" })} />
          {g.on && <NumberInput value={g.len || 0} onChange={(v) => setObj("roof_sealer", { len: v })} placeholder="ยาว (ม.)" step={0.1} />}
        </div>
      </Field>
    );
  }
  if (ad === "roof_film") {
    return (
      <Field label="ฟิล์ม/ลามิเนตหลังคา" hint="(กันร้อน/UV · กรอก ฿/ตร.ม. × พื้นที่หลังคา)">
        <NumberInput value={A.roof_film || 0} onChange={(v) => set("roof_film", v)} placeholder="฿/ตร.ม. (เว้น=ไม่มี)" />
      </Field>
    );
  }
  if (ad === "roof_2nd") {
    const g = A.roof_2nd || { mat: "", len: 0, proj: 0, rate: 0 };
    return (
      <Field label="หลังคาผสม วัสดุที่ 2" hint="(ต่อปลาย · ยาว×ยื่น × ฿/ตร.ม.)">
        <div className="space-y-2">
          <ChipRow
            items={[{ val: "", label: "ไม่มี" }, { val: "ไวนิล", label: "ไวนิล" }, { val: "ดีไลท์", label: "ดีไลท์" }, { val: "โพลีฯ/กระจก", label: "โพลีฯ/กระจก" }, { val: "เมทัลชีท", label: "เมทัล" }, { val: "ชินโค", label: "ชินโค" }]}
            value={g.mat || ""}
            onChange={(v) => setObj("roof_2nd", { mat: v })}
          />
          {g.mat && (
            <div className="grid grid-cols-3 gap-2">
              <NumberInput value={g.len || 0} onChange={(v) => setObj("roof_2nd", { len: v })} placeholder="ยาว (ม.)" step={0.1} />
              <NumberInput value={g.proj || 0} onChange={(v) => setObj("roof_2nd", { proj: v })} placeholder="ยื่น (ม.)" step={0.1} />
              <NumberInput value={g.rate || 0} onChange={(v) => setObj("roof_2nd", { rate: v })} placeholder="฿/ตร.ม." />
            </div>
          )}
        </div>
      </Field>
    );
  }
  if (ad === "ceil_under") {
    const g = A.ceil_under || { on: false, type: "ฉาบเรียบ", insul: false, area: 0 };
    return (
      <Field label="ฝ้าใต้หลังคา" hint="(ออปชั่น · รวมในชุดหลังคา)">
        <div className="space-y-2">
          <ChipRow items={[{ val: "no", label: "ไม่มี" }, { val: "yes", label: "มีฝ้า" }]} value={g.on ? "yes" : "no"} onChange={(v) => setObj("ceil_under", { on: v === "yes" })} />
          {g.on && (
            <>
              <ChipRow items={Object.keys(CEIL_RATE).map((x) => ({ val: x, label: `${x} (${fmt(CEIL_RATE[x])})` }))} value={g.type || "ฉาบเรียบ"} onChange={(v) => setObj("ceil_under", { type: v })} />
              <ChipRow items={[{ val: "no", label: "ไม่มี" }, { val: "yes", label: "มี (+600/ตร.ม.)" }]} value={g.insul ? "yes" : "no"} onChange={(v) => setObj("ceil_under", { insul: v === "yes" })} />
              <NumberInput value={g.area || 0} onChange={(v) => setObj("ceil_under", { area: v })} placeholder={`เท่าหลังคา (${fmtNum(area)} ตร.ม.)`} step={0.1} />
              <ChipRow items={[{ val: "in", label: "ในห้อง" }, { val: "out", label: "นอกห้อง" }]} value={g.pos || "in"} onChange={(v) => setObj("ceil_under", { pos: v })} />
              <ChipRow items={[{ val: "flat", label: "ตรง" }, { val: "slope", label: "เฉียงตามหลังคา" }]} value={g.dir || "flat"} onChange={(v) => setObj("ceil_under", { dir: v })} />
              <input
                type="text" placeholder="รหัส/สีฝ้า เช่น ขาว / รหัสสี" value={g.code || ""}
                onChange={(e) => setObj("ceil_under", { code: e.target.value })}
                className="w-full min-h-[44px] glass-soft rounded-lg px-3 py-2 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
              />
            </>
          )}
        </div>
      </Field>
    );
  }
  if (ad === "louver_door") {
    // ระแนงทำเป็นบาน — engine อ่านจาก ctx.opt.spec (rnPanels/rnDoorPrice/rnRail/rnCloser/rnThresh/rnSwingHandle...)
    // ผูกกับ prod.rnCascade + spec.panelform ใน mockup (ต้องมี spec UI คู่กันซึ่งเป็นระบบระแนงเฉพาะ ยังไม่มีใน products.mjs รุ่นที่พอร์ตแล้ว)
    // เปิด selector "ทำเป็นบาน" ง่าย ๆ (sel = ชนิดบาน) ให้ครบตาม engine.louver_door contract
    const type = A.louver_door || "ติดตาย";
    return (
      <Field label="ระแนงทำเป็นบาน" hint="(โครงบาน G1 · มีผลกับราคา)">
        <ChipRow
          items={[{ val: "ติดตาย", label: "ติดตาย (ไม่ทำบาน)" }, { val: "บานเลื่อน", label: "บานเลื่อน" }, { val: "บานเฟี้ยม", label: "บานเฟี้ยม" }, { val: "บานเปิด", label: "บานเปิด" }]}
          value={type}
          onChange={(v) => set("louver_door", v)}
        />
        {type !== "ติดตาย" && (
          <p className="text-[11px] text-ink-3 mt-1.5">ตั้งค่ารุ่นบานอ้างอิง/จำนวนบาน/ค่าทำบานกรอกเอง — ระบุในสเปกบาน G1 ที่เกี่ยวข้อง (ยังไม่ครบ UI cascade เต็มรูปแบบของ mockup)</p>
        )}
      </Field>
    );
  }
  // ── กลุ่ม HANDLE_ADDONS / OPENING_ADDONS / AUTO_ADDONS ที่ engine รองรับแต่ไม่มี product ใดประกาศ addons ชนิดนี้ในปัจจุบัน ──
  // (cmech, stainless, digihandle, closer, thresh, hide_track, inner_track, motor, awn_tt, awn_brace,
  //  slide_auto, awn_auto, banklet_motor, grid, solid_panel, soft_close, sling, u_track, beam_support, hide_beam, drop_floor)
  // ครอบคลุมด้วย branch ด้านบนแล้วถ้ามีการเปิดใช้ในอนาคต — ที่เหลือ (slide_motor) เขียนแยกด้านล่าง
  if (ad === "slide_motor") {
    const sm = (A.slide_motor && typeof A.slide_motor === "object") ? A.slide_motor : { kw: "1500" };
    const kw = sm.kw || "1500";
    return (
      <Field label="มอเตอร์หลังคาเลื่อน" hint="(มีผลกับราคา)">
        <div className="space-y-2">
          <ChipRow items={[{ val: "1500", label: "ยก 1,500 กก." }, { val: "300", label: "ยก 300 กก." }, { val: "80", label: "ยก 80 กก." }]} value={kw} onChange={(v) => setObj("slide_motor", { kw: v })} />
          {kw === "1500" && (
            <>
              <Field label="ฟันเฟือง — ระยะยื่น (ม.)" hint="· 340/ม. · เว้น 0 = ไม่มี">
                <NumberInput value={sm.gearLen || 0} onChange={(v) => setObj("slide_motor", { gearLen: v })} placeholder="0" step={0.1} />
              </Field>
              <Field label="เซนเซอร์กันฝน">
                <ChipRow items={[{ val: "no", label: "ไม่มี" }, { val: "yes", label: "มี (+1,100 ทุน)" }]} value={sm.sensor ? "yes" : "no"} onChange={(v) => setObj("slide_motor", { sensor: v === "yes" })} />
              </Field>
            </>
          )}
        </div>
      </Field>
    );
  }
  return null;
}

function fmtNum(n: number) {
  return (n || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 });
}

/* ── ส่วนหลัก ── */
export default function AddonsSection({ prod, addons, setAddons, area, W, movePanes }: {
  prod: any; addons: AddonsMap; setAddons: (fn: (a: AddonsMap) => AddonsMap) => void; area: number; W: number; movePanes?: number;
}) {
  const list: string[] = prod?.addons || [];
  if (!list.length) return null;

  const opening = addonsIn(list, OPENING_ADDONS);
  const handle = addonsIn(list, HANDLE_ADDONS);
  const screen = addonsIn(list, SCREEN_ADDONS);
  const mainExtra = addonsIn(list, MAIN_EXTRA_ADDONS);
  const auto = addonsIn(list, AUTO_ADDONS);
  const rest = addonsRest(list);

  const groups: { icon: string; label: string; ids: string[] }[] = [
    { icon: "🚪", label: "ชนิดการเปิด · ราง · ธรณี", ids: opening },
    { icon: "🤚", label: "มือจับ", ids: handle },
    { icon: "🦟", label: "มุ้ง · ม่าน", ids: screen },
    { icon: "⚙️", label: "มอเตอร์ / ระบบออโต้", ids: auto },
    { icon: "📋", label: "ออปชั่นใช้บ่อย", ids: mainExtra },
    { icon: "➕", label: "ออปชั่นเสริม", ids: rest },
  ].filter((g) => g.ids.length > 0);

  return (
    <div className="mt-4 space-y-4 rounded-2xl glass-soft p-4">
      <div className="text-sm font-bold text-brand-dark flex items-center gap-1.5">
        ของเสริม <span className="text-xs font-normal text-ink-3">({list.length} รายการ)</span>
      </div>
      {groups.map((g) => (
        <div key={g.label} className="space-y-2.5">
          <SectionHeader icon={g.icon} label={g.label} />
          {g.ids.map((ad) => (
            <AddonField key={ad} ad={ad} prod={prod} addons={addons} setAddons={setAddons} area={area} W={W} movePanes={movePanes ?? 1} />
          ))}
        </div>
      ))}
    </div>
  );
}
