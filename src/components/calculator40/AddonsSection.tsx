"use client";

/**
 * ของเสริม (add-ons) — คิดราคา 4.0
 * Port ตรงจาก mockup R4.0 (app.js บรรทัด ~1740-2130, การจัดกลุ่ม ~1033-1040)
 * แต่ละ addon เก็บค่าใน state `addons: Record<string, any>` ส่งเข้า computeCost เป็น opt.addons[id]
 * sel shape ต้องตรงกับที่ engine.mjs `computeAddon(id, sel, ctx)` คาดหวังเป๊ะ — ห้ามเดา/แก้ shape เอง
 *
 * แก้ 2ก.ค. (ผล QA: ปุ่มหายจริง) — เติม branch UI ให้ครบทุก id ที่ประกาศใน prod.addons จริง (bootstrap ผูกให้ G1/G2)
 * แต่ก่อนหน้านี้ AddonField ไม่มี branch รองรับ: cmech, stainless, digihandle (รวมเป็นหมวด 🤚 มือจับเดียว ตรง mockup
 * renderHandleSection), closer, thresh, hide_track, inner_track, motor, slide_auto, grid, awn_tt, awn_brace,
 * awn_auto, banklet_motor — ก๊อป UI จาก scratchpad/r40/app.js บรรทัด ~1751-2115 + renderHandleSection ~1696-1717
 * เป๊ะทุก branch (ค่า/ชื่อคีย์ตรง sel shape ที่ engine.mjs computeAddon อ่าน)
 *
 * id ที่เหลือ (soft_close, sling, u_track, beam_support, hide_beam, drop_floor) มี branch อยู่แล้วด้านล่าง
 * — ไม่มี id ไหนที่ engine รู้จักแต่ยังไม่มี branch UI อีกแล้ว (เช็คซ้ำกับ computeAddon ทุก id 2ก.ค.)
 */

import { useEffect } from "react";
import { fmt } from "@/lib/calculator40/fmt";
// @ts-expect-error — mosquito helper เป็น ESM JS ล้วน
import { MOSQ_CHIPS, mosqVariants } from "@/lib/calculator40/mosquito.mjs";
// @ts-expect-error — products เป็น ESM JS ล้วน (ใช้ดึง screen_ready.materials สำหรับรุ่นย่อยมุ้ง)
import { PRODUCTS } from "@/lib/calculator40/products.mjs";
// @ts-expect-error — engine เป็น ESM JS ล้วน (ตาราง CMECH_TIERS/STAINLESS_TIERS/ADDON_FLAT/CEIL_RATE แหล่งเดียวกับที่ computeAddon ใช้คิดเงิน — import ตรง กันป้าย/ราคาหลุดกัน)
import { CMECH_TIERS, STAINLESS_TIERS, ADDON_FLAT as ADDON_FLAT_RAW, CEIL_RATE as CEIL_RATE_RAW, zRate as zRateFn } from "@/lib/calculator40/engine.mjs";
const ADDON_FLAT: Record<string, number> = ADDON_FLAT_RAW;
const CEIL_RATE: Record<string, number> = CEIL_RATE_RAW;
// @ts-expect-error — r39-data เป็นไฟล์ข้อมูล .json (DIGI = ตารางมือจับดิจิตอล ราคา/ชื่อรุ่น)
import R39DATA from "@/lib/calculator40/r39-data.json";

/* eslint-disable @typescript-eslint/no-explicit-any */

type AddonsMap = Record<string, any>;

// ADDON_FLAT + CEIL_RATE ย้ายไป import จาก engine.mjs (แหล่งเดียว — กันป้าย UI/ราคา engine หลุดกันในอนาคต)
// สีเส้นคาดอัตโนมัติตามสีเฟรม (R3.9 GRID_RATE_BY_BAKE) — auto จนกว่าจะกดเลือกเอง (rateTouched)
const GRID_RATE_BY_BAKE: Record<string, number> = { white: 200, sahara: 200, woodStock: 250, special: 300, woodSpecial: 350 };
const gridRateFor = (bake: string) => GRID_RATE_BY_BAKE[bake] || 200;

// ── กลุ่มออปชั่นเสริม → จัดเข้าหมวด (แค่จัดหน้า ไม่กระทบราคา/engine) — ตรง app.js OPENING/HANDLE/SCREEN/MAIN_EXTRA/AUTO_ADDONS ──
const OPENING_ADDONS = ["closer", "thresh", "hide_track", "inner_track", "motor", "awn_tt", "awn_brace"];
const HANDLE_ADDONS = ["cmech", "stainless", "digihandle"];
const SCREEN_ADDONS = ["mosquito", "roof_zip", "door_zip", "zip_motor", "zip_noremote", "zip_smart", "zip_remote"];
const MAIN_EXTRA_ADDONS = ["grid", "solid_panel", "elec", "shower_corner", "shower_hw"];
const AUTO_ADDONS = ["slide_motor", "slide_auto", "awn_auto", "banklet_motor", "rain_sensor"];
const HANDLE_LABELS: Record<string, string> = { cmech: "Cmech", stainless: "สแตนเลสอร่าม", digihandle: "ดิจิตอล" };

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
function AddonField({ ad, prod, addons, setAddons, area, W, movePanes, color, form }: {
  ad: string; prod: any; addons: AddonsMap; setAddons: (fn: (a: AddonsMap) => AddonsMap) => void; area: number; W: number; movePanes: number; color: string; form: string;
}) {
  const A = addons;
  const set = (k: string, v: any) => setAddons((old) => ({ ...old, [k]: v }));
  const setObj = (k: string, patch: any) => setAddons((old) => ({ ...old, [k]: { ...(old[k] || {}), ...patch } }));

  // R3.9: แขนค้ำ (awn_brace) เฉพาะบานกระทุ้งเปิดล่าง — ไม่ใช่เปิดล่าง = เคลียร์ค่าทิ้ง (ตรง app.js เดิม mutate ตอน render
  // แต่ React ห้าม setState ระหว่าง render ตรง ๆ → ย้ายเป็น useEffect · ต้องอยู่ก่อน early return ใด ๆ (Rules of Hooks)
  useEffect(() => {
    if (ad === "awn_brace" && form !== "เปิดล่าง" && A.awn_brace === "yes") set("awn_brace", "none");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ad, form, A.awn_brace]);

  if (ad === "closer") {
    return (
      <Field label="โช้คอัพประตู">
        <ChipRow
          items={[{ val: "none", label: "ไม่มี" }, { val: "arm", label: "แขนยื่น (+5,000)" }, { val: "slide", label: "รางเลื่อน (+5,000)" }, { val: "fold", label: "บานพับ (+5,000)" }]}
          value={A.closer || "none"}
          onChange={(v) => set("closer", v)}
        />
      </Field>
    );
  }
  if (ad === "thresh") {
    return (
      <Field label="ธรณีประตู">
        <ChipRow
          items={[{ val: "none", label: "กันน้ำ (มาตรฐาน)" }, { val: "turtle", label: "หลังเต่า+Drop Seal (+1,000)" }, { val: "turtle_felt", label: "หลังเต่า+สักหลาด (ฟรี)" }, { val: "nothresh", label: "ไม่มีธรณี (ฟรี)" }]}
          value={A.thresh || "none"}
          onChange={(v) => set("thresh", v)}
        />
      </Field>
    );
  }
  if (ad === "grid") {
    const g = A.grid || { nh: 0, nv: 0 };
    // ออโต้: เส้นคาดสีเดียวกับเฟรม จนกว่าจะเลือกเอง (rateTouched) — ตรง app.js renderAddonField 'grid'
    const rate = g.rateTouched ? (g.rate || 200) : gridRateFor(color);
    const wM = W || 0, hM = (area && wM) ? area / wM : 0;
    // custom ความยาวเส้น (เจ้าของเคาะ 17ก.ค.69) — เว้น = อัตโนมัติตามกว้าง/สูงบาน
    const hLen = +g.hLen > 0 ? +g.hLen : wM;
    const vLen = +g.vLen > 0 ? +g.vLen : hM;
    const len = (g.nh || 0) * hLen + (g.nv || 0) * vLen;
    return (
      <Field label="คาดตาราง (เส้น)">
        <div className="grid grid-cols-3 gap-2">
          <NumberInput value={g.nh || 0} onChange={(v) => setObj("grid", { nh: Math.round(v) })} placeholder="แนวนอน" />
          <NumberInput value={g.nv || 0} onChange={(v) => setObj("grid", { nv: Math.round(v) })} placeholder="แนวตั้ง" />
          <NumberInput value={g.nc || 0} onChange={(v) => setObj("grid", { nc: Math.round(v) })} placeholder="เส้นโค้ง (+3,000)" />
        </div>
        {/* กำหนดขนาดเส้นเอง (ม.) — เว้นว่าง = อัตโนมัติตามบาน */}
        <div className="grid grid-cols-2 gap-2 mt-2">
          <div>
            <div className="text-[11px] text-ink-3 mb-0.5">ยาวเส้นนอน (ม. · เว้น=กว้าง {fmtNum(wM)})</div>
            <NumberInput value={g.hLen || 0} onChange={(v) => setObj("grid", { hLen: v })} placeholder={fmtNum(wM)} />
          </div>
          <div>
            <div className="text-[11px] text-ink-3 mb-0.5">ยาวเส้นตั้ง (ม. · เว้น=สูง {fmtNum(hM)})</div>
            <NumberInput value={g.vLen || 0} onChange={(v) => setObj("grid", { vLen: v })} placeholder={fmtNum(hM)} />
          </div>
        </div>
        <p className="text-[11px] text-ink-3 mt-1.5">
          สูตร: (นอน {g.nh || 0}×{fmtNum(hLen)} + ตั้ง {g.nv || 0}×{fmtNum(vLen)}) = {fmtNum(len)} ม. × {rate} = {fmt(len * rate)} บาท
        </p>
        <div className="mt-2">
          <ChipRow
            items={[{ val: "200", label: "อบขาว/ดำ/ซาฮาร่า" }, { val: "250", label: "ลายไม้สต็อก (+50/ม.)" }, { val: "300", label: "อบพิเศษ/Fuji (+100/ม.)" }, { val: "350", label: "ลายไม้อบพิเศษ (+150/ม.)" }]}
            value={String(rate)}
            onChange={(v) => setObj("grid", { rate: +v, rateTouched: true })}
          />
        </div>
      </Field>
    );
  }
  if (ad === "elec") {
    // งานไฟ (เจ้าของเคาะ 17ก.ค.69) — พัดลม/ฝาครอบ/สวิตซ์ · ราคาขายตรง ๆ · กดเพิ่มจำนวนตัว
    const e = A.elec || {};
    const n = (k: string) => Math.max(0, Math.round(Number(e[k]) || 0));
    const total = n("fan8") * 3000 + n("fan10") * 3000 + n("cover") * 1000 + n("sw") * 500;
    const row = (k: string, label: string) => (
      <div>
        <div className="text-[11px] text-ink-3 mb-0.5">{label}</div>
        <NumberInput value={n(k)} onChange={(v) => setObj("elec", { [k]: Math.max(0, Math.round(v)) })} placeholder="0" />
      </div>
    );
    return (
      <Field label="⚡ งานไฟ (พัดลม / หน้ากาก / สวิตซ์)">
        <div className="grid grid-cols-2 gap-2">
          {row("fan8", 'พัดลมดูดอากาศ 8" (3,000/ตัว)')}
          {row("fan10", 'พัดลมดูดอากาศ 10" (3,000/ตัว)')}
          {row("cover", 'ฝาครอบกันแมลง 8"/10" (1,000/ตัว)')}
          {row("sw", "สวิตซ์ไฟ (500/จุด)")}
        </div>
        {total > 0 && <p className="text-[11px] text-ink-3 mt-1.5">รวมงานไฟ = {fmt(total)} บาท</p>}
      </Field>
    );
  }
  if (ad === "solid_panel") {
    // บานล่างทึบ คอมโพสิต/ลูกฟูก (เจ้าของเคาะ 17ก.ค.69 · ประตู custom ล่างทึบบนกระจก) — engine solid_panel
    const g = A.solid_panel || {};
    const t = g.type || "none";
    const pw = +g.w > 0 ? +g.w : (W || 0);
    const ph = +g.h || 0;
    // เกล็ด Z (z1/z16) ราคาตามสีอลูหลัก · คอมโพสิต/ลูกฟูก คงที่ (แหล่งเดียวกับ engine solid_panel)
    const rate = t === "z1" ? zRateFn("1", color) : t === "z16" ? zRateFn("1.6", color) : t === "comp" ? 3300 : 3500;
    return (
      <Field label="บานล่างทึบ (คอมโพสิต/ลูกฟูก/เกล็ด Z แทนกระจกช่วงล่าง)">
        <ChipRow
          items={[{ val: "none", label: "ไม่มี (กระจกเต็มบาน)" }, { val: "comp", label: "คอมโพสิต (3,300/ตร.ม.)" }, { val: "look", label: "อลูลูกฟูก (3,500/ตร.ม.)" }, { val: "z1", label: "เกล็ด Z 1\" (ตามสีอลู)" }, { val: "z16", label: "เกล็ด Z 1.6\" (ตามสีอลู)" }]}
          value={t} onChange={(v) => setObj("solid_panel", { type: v })}
        />
        {t !== "none" && (
          <>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div>
                <div className="text-[11px] text-ink-3 mb-0.5">กว้างแผ่น (ม. · เว้น=กว้างบาน {fmtNum(W || 0)})</div>
                <NumberInput value={g.w || 0} onChange={(v) => setObj("solid_panel", { w: v })} placeholder={fmtNum(W || 0)} />
              </div>
              <div>
                <div className="text-[11px] text-ink-3 mb-0.5">สูงแผ่นล่าง (ม.)</div>
                <NumberInput value={g.h || 0} onChange={(v) => setObj("solid_panel", { h: v })} placeholder="0" />
              </div>
            </div>
            {ph > 0
              ? <p className="text-[11px] text-ink-3 mt-1.5">แผ่น {fmtNum(pw)}×{fmtNum(ph)} = {fmtNum(pw * ph)} ตร.ม. × {rate} = {fmt(pw * ph * rate)} บาท</p>
              : <p className="text-[11px] text-amber-600 mt-1.5">กรอกสูงแผ่นล่าง (ม.) เพื่อคิดราคา</p>}
          </>
        )}
      </Field>
    );
  }
  // ── หมวด 🤚 มือจับ — รวมกล่องเดียว ตรง app.js renderHandleSection: เลือกชนิด → โชว์รุ่นของชนิดนั้น (มือจับชนิดเดียวต่อบาน) ──
  if (ad === "cmech" || ad === "stainless" || ad === "digihandle") {
    // AddonsSection เรียก AddonField ต่อ id — ให้ id แรกที่เจอใน list (ตามลำดับ HANDLE_ADDONS) เป็นตัวเรนเดอร์กล่องรวม กันซ้ำ 3 กล่อง
    const avail = HANDLE_ADDONS.filter((id) => (prod.addons || []).includes(id));
    if (avail[0] !== ad) return null;
    const cur: string = (A.handleType && avail.includes(A.handleType)) ? A.handleType : (avail.find((id) => A[id]) || "none");
    const chips = [{ val: "none", label: "มือจับมาตรฐาน (ฟรี)" }, ...avail.map((id) => ({ val: id, label: HANDLE_LABELS[id] || id }))];
    const onPick = (v: string) => {
      const isDoorish = /ประตู|บานเปิด|PC|สวิง|โซลิด|เปิด/.test(prod.name || "");
      const isAwn = /กระทุ้ง/.test(prod.name || "");
      setAddons((old) => {
        const next: AddonsMap = { ...old, handleType: v };
        avail.forEach((id) => { if (id !== v) next[id] = ""; });
        // เลือก Cmech → ตั้ง default (แบบ ฝัง · ประตู/หน้าต่างตามรุ่น · สี White) ให้คิดราคาได้ทันที
        if (v === "cmech" && !next.cmech) {
          next.cmechStyle = next.cmechStyle || "embed";
          next.cmechDoor = next.cmechDoor || (isDoorish ? "door" : "window");
          next.cmechColor = next.cmechColor || "White";
          next.cmech = isAwn ? "awn_normal" : `${next.cmechStyle}_${next.cmechDoor}_normal`;
        }
        return next;
      });
    };
    return (
      <Field label="ชนิดมือจับ">
        <ChipRow items={chips} value={cur} onChange={onPick} />
        {cur !== "none" && (
          <>
            <div className="mt-2.5">{renderHandleModel(cur, prod, A, setAddons, set)}</div>
            <div className="mt-2.5 max-w-[160px]">
              <div className="text-[11px] text-ink-3 mb-0.5">จำนวนชุด</div>
              <NumberInput value={A.handleQty || 1} onChange={(v) => set("handleQty", Math.max(1, Math.round(v) || 1))} placeholder="1" />
            </div>
          </>
        )}
      </Field>
    );
  }
  if (ad === "motor") {
    return (
      <Field label="ชุดออโต้บานยก / เฟี้ยมยก" hint="(ราคาออโต้ = ทุน รวมค่าส่ง · ขายคูณกำไร%)">
        <ChipRow
          items={[{ val: "none", label: "ไม่มี" }, { val: "80", label: "ยก 80 กก. (ทุน 6,200)" }, { val: "300", label: "ยก 300 กก. (ทุน 14,200)" }]}
          value={A.motor || "none"}
          onChange={(v) => set("motor", v)}
        />
        {A.motor === "80" && area > 3.5 && (
          <p className="text-[11px] text-amber-700 mt-1.5">มอเตอร์ 80 กก. ใช้ได้ ≤3.5 ตร.ม. (พื้นที่ {fmtNum(area)}) — เปลี่ยนเป็น 300 กก.</p>
        )}
      </Field>
    );
  }
  if (ad === "hide_track") {
    return (
      <Field label="ซ่อนราง">
        <ChipRow items={[{ val: "none", label: "ไม่มี" }, { val: "yes", label: `ซ่อนราง (+${fmt(ADDON_FLAT.hide_track)} · ฟรี ≤3ม.)` }]} value={A.hide_track || "none"} onChange={(v) => set("hide_track", v)} />
      </Field>
    );
  }
  if (ad === "inner_track") {
    return (
      <Field label="ราง (เลื่อนภายในรางบน)">
        <ChipRow items={[{ val: "none", label: "โชว์ราง" }, { val: "yes", label: "ซ่อนราง (+5,000)" }]} value={A.inner_track || "none"} onChange={(v) => set("inner_track", v)} />
      </Field>
    );
  }
  if (ad === "awn_tt") {
    return (
      <Field label="บานกระทุ้ง Tilt & Turn">
        <ChipRow items={[{ val: "none", label: "ไม่มี" }, { val: "yes", label: "มี (+5,000/บาน)" }]} value={A.awn_tt || "none"} onChange={(v) => set("awn_tt", v)} />
        {A.awn_tt === "yes" && <p className="text-[11px] text-amber-700 mt-1.5">Tilt & Turn ต้องเปิดออกนอกบ้านเท่านั้น (เปิดเข้า = เสี่ยงน้ำเข้า)</p>}
      </Field>
    );
  }
  if (ad === "awn_brace") {
    // R3.9: แขนค้ำเฉพาะบานกระทุ้งเปิดล่าง (เคลียร์ค่าเมื่อไม่ใช่ — จัดการใน useEffect ด้านบนแล้ว)
    if (form !== "เปิดล่าง") return null;
    return (
      <Field label="เสริมแขนค้ำ" hint="(เฉพาะเปิดล่าง)">
        <ChipRow items={[{ val: "none", label: "ไม่มี" }, { val: "yes", label: "มี (+500)" }]} value={A.awn_brace || "none"} onChange={(v) => set("awn_brace", v)} />
      </Field>
    );
  }
  if (ad === "awn_auto") {
    return (
      <Field label="ชุดออโต้บานกระทุ้ง" hint="(× จำนวนบาน + ค่าส่ง 1,700 ครั้งเดียว)">
        <ChipRow
          items={[{ val: "none", label: "ไม่มี" }, { val: "choke50", label: "โช้คเปิด 50" }, { val: "choke80", label: "โช้คเปิด 80" }, { val: "chain1", label: "โซ่เดี่ยว 50" }, { val: "chain2", label: "โซ่คู่ 50" }]}
          value={A.awn_auto || "none"}
          onChange={(v) => set("awn_auto", v)}
        />
        {(A.awn_auto === "choke50" || A.awn_auto === "choke80") && (movePanes || 0) >= 2 && (
          <p className="text-[11px] text-ink-3 mt-1.5">+ อุปกรณ์พิเศษ (โช็ค 2 ตัว) ทุน 600 — ระบบบวกให้แล้ว</p>
        )}
      </Field>
    );
  }
  if (ad === "banklet_motor") {
    return (
      <Field label="มอเตอร์บานเกล็ด" hint="(ทุน 1,800 · ไม่มีค่าส่ง)">
        <ChipRow items={[{ val: "none", label: "ไม่มี" }, { val: "yes", label: "มีมอเตอร์ (ทุน 1,800)" }]} value={A.banklet_motor || "none"} onChange={(v) => set("banklet_motor", v)} />
      </Field>
    );
  }
  if (ad === "slide_auto") {
    const sa = (A.slide_auto && typeof A.slide_auto === "object") ? A.slide_auto : { brand: "none" };
    // ยี่ห้อที่รุ่นนี้เลือกได้จริง — ชีตราคาออโต้แยกหมวด "เลื่อน SMS/ยูโร" กับ "SlimLux"
    //   ไม่กำหนดไว้ = โชว์ทั้งหมด (ของเดิม) · เจ้าของสั่ง 3 ก.ย.69 "ให้ขึ้นตามประเภทบาน ห้ามขึ้นมั่ว"
    const BRAND_CHIPS: Record<string, string> = { evecca: "Evecca (จีน)", changsaek: "ช่างแซก", slimlux: "SlimLux" };
    const brands: string[] = Array.isArray(prod?.autoBrands) ? prod.autoBrands : Object.keys(BRAND_CHIPS);
    return (
      <Field label="ชุดมอเตอร์บานเลื่อน (ออโต้)" hint="(ราคาออโต้ = ทุน · ขายคูณกำไร%)">
        <div className="space-y-2">
          <ChipRow
            items={[{ val: "none", label: "ไม่มี (มือเลื่อน)" }, ...brands.map((b) => ({ val: b, label: BRAND_CHIPS[b] || b }))]}
            value={sa.brand || "none"}
            onChange={(v) => setObj("slide_auto", { brand: v })}
          />
          {sa.brand === "evecca" && (
            <>
              <Field label="Smart lock">
                <ChipRow items={[{ val: "no", label: "ไม่มี" }, { val: "yes", label: "มี (Smart lock)" }]} value={sa.smartlock ? "yes" : "no"} onChange={(v) => setObj("slide_auto", { smartlock: v === "yes" })} />
              </Field>
              <p className="text-[11px] text-ink-3">+ สายพานตามความกว้าง × 2 (อัตโนมัติ)</p>
            </>
          )}
          {sa.brand === "changsaek" && (
            <>
              <p className="text-[11px] text-ink-3">+ เซฟตี้ตาแมว (บังคับ) + ราง/ม. (อัตโนมัติ)</p>
              <Field label="ออปชั่นเสริม">
                <ChipRow
                  items={[{ val: "no", label: "ไม่มี" }, { val: "touch", label: "Touch" }, { val: "infrared", label: "Infrared" }, { val: "both", label: "Touch+Infrared" }]}
                  value={sa.touch && sa.infrared ? "both" : sa.infrared ? "infrared" : sa.touch ? "touch" : "no"}
                  onChange={(v) => setObj("slide_auto", { touch: v === "touch" || v === "both", infrared: v === "infrared" || v === "both" })}
                />
              </Field>
            </>
          )}
          {sa.brand === "slimlux" && (
            <>
              <p className="text-[11px] text-ink-3">+ ราง/ม. × จำนวนบาน + บานเพิ่ม (อัตโนมัติ)</p>
              <Field label="ระบบสั่งงาน" hint="(บังคับเลือก)">
                <ChipRow
                  items={[{ val: "touch", label: "Touch Switch (+100)" }, { val: "scan", label: "สแกนหน้า (+2,750)" }]}
                  value={sa.scan ? "scan" : "touch"}
                  onChange={(v) => setObj("slide_auto", { scan: v === "scan" })}
                />
              </Field>
            </>
          )}
        </div>
      </Field>
    );
  }

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
  if (ad === "roof_zip") {              // ม่านซิปบนหลังคา (Skylight) — ราคาจาก G7 ม่านซิป (คิดจริงใน Calculator40Client/RoomComposer)
    const rz = A.roof_zip || "none";
    return (
      <Field label="ม่านซิปบนหลังคา" hint="(Skylight · ราคาจาก G7 ม่านซิป)">
        <div className="space-y-2.5">
          <ChipRow
            items={[{ val: "none", label: "ไม่มี" }, { val: "sky100", label: "Skylight 100" }, { val: "sky120", label: "Skylight 120" }]}
            value={rz}
            onChange={(v) => set("roof_zip", v)}
          />
          {rz !== "none" && (
            <>
              <Field label="ผ้า (ความโปร่ง)">
                <ChipRow
                  items={[{ val: "5", label: "F05 5% (ขายดี)" }, { val: "10", label: "F10 10%" }, { val: "30", label: "F30 30%" }]}
                  value={A.rzFab || "5"}
                  onChange={(v) => set("rzFab", v)}
                />
              </Field>
              <Field label="รีโมทในชุด">
                <ChipRow items={[{ val: "none", label: "มีรีโมท 1 ตัว" }, { val: "yes", label: "ไม่เอารีโมท (−)" }]} value={A.rzNoRemote || "none"} onChange={(v) => set("rzNoRemote", v)} />
              </Field>
              <p className="text-[11px] text-ink-3">คิดราคาจากรุ่นม่านซิป Skylight (รวมมอเตอร์ Skylight ในชุด) · ขนาด = ขนาดหลังคา · ราคาโชว์ในสรุปยอด</p>
            </>
          )}
        </div>
      </Field>
    );
  }
  if (ad === "door_zip") {              // ม่านซิปประตู (Z100/Z120) — ราคาจาก G7 ม่านซิป (คิดจริงใน RoomComposer)
    const dz = A.door_zip || "none";
    return (
      <Field label="ม่านซิปประตู" hint="(G7 ม่านซิป Z100/Z120)">
        <div className="space-y-2.5">
          <ChipRow
            items={[{ val: "none", label: "ไม่มี" }, { val: "z100", label: "Z100" }, { val: "z120", label: "Z120" }]}
            value={dz}
            onChange={(v) => set("door_zip", v)}
          />
          {dz !== "none" && (
            <>
              <Field label="ผ้า (ความโปร่ง)">
                <ChipRow
                  items={[{ val: "5", label: "F05 5% (ขายดี)" }, { val: "10", label: "F10 10%" }, { val: "30", label: "F30 30%" }]}
                  value={A.dzFab || "5"}
                  onChange={(v) => set("dzFab", v)}
                />
              </Field>
              <Field label="รีโมทในชุด">
                <ChipRow items={[{ val: "none", label: "มีรีโมท 1 ตัว" }, { val: "yes", label: "ไม่เอารีโมท (−)" }]} value={A.dzNoRemote || "none"} onChange={(v) => set("dzNoRemote", v)} />
              </Field>
              <p className="text-[11px] text-ink-3">คิดราคาจากรุ่นม่านซิป {dz === "z120" ? "Z120" : "Z100"} (รวมมอเตอร์ในชุด) · ขนาด = ขนาดบานประตู · ราคาโชว์ในสรุปยอด</p>
            </>
          )}
        </div>
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
  // (ลบ branch solid_panel เก่าที่ซ้ำ/unreachable แล้ว — ใช้ตัวใหม่ด้านบน L207 ที่มีช่องกว้าง/สูงแผ่น · QA 17ก.ค.69)
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
  if (ad === "rain_sensor") {
    return (
      <Field label="เซนเซอร์กันฝน" hint="(ออโต้ปิดเองเมื่อฝนตก · ทุน 1,100)">
        <ChipRow
          items={[{ val: "none", label: "ไม่มี" }, { val: "yes", label: "มี (+1,100 ทุน)" }]}
          value={A.rain_sensor || "none"}
          onChange={(v) => set("rain_sensor", v)}
        />
      </Field>
    );
  }
  if (ad === "slide_motor") {
    const sm = (A.slide_motor && typeof A.slide_motor === "object") ? A.slide_motor : {};
    const kw = sm.kw || "none";   // ไม่เลือก = ไม่มีมอเตอร์ (ตรงกับ engine)
    return (
      <Field label="มอเตอร์หลังคาเลื่อน" hint="(มีผลกับราคา)">
        <div className="space-y-2">
          <ChipRow items={[{ val: "none", label: "ไม่มี" }, { val: "1500", label: "ยก 1,500 กก." }, { val: "300", label: "ยก 300 กก." }, { val: "80", label: "ยก 80 กก." }]} value={kw} onChange={(v) => setObj("slide_motor", { kw: v })} />
          {kw !== "none" && (<>
          {/* เซนเซอร์กันฝน — เจ้าของสั่ง 4 ก.ย.69 "เป็นออปชั่นให้เลือก" (เดิมบังคับติดเฉพาะ 1500 กก.)
              ยังติ๊กมาให้เองเมื่อเลือก 1,500 กก. ตามที่ไฟล์ v20.1 เขียนไว้ แต่กดเอาออกได้ */}
          <Field label="เซนเซอร์กันฝน" hint="(ออโต้ปิดเองเมื่อฝนตก · ทุน 1,100)">
            <ChipRow
              items={[{ val: "no", label: "ไม่มี" }, { val: "yes", label: "มี (+1,100 ทุน)" }]}
              value={(sm.sensor === undefined || sm.sensor === null ? kw === "1500" : !!sm.sensor) ? "yes" : "no"}
              onChange={(v) => setObj("slide_motor", { sensor: v === "yes" })}
            />
          </Field>
          {kw === "1500" && (
            <Field label="ฟันเฟือง — ระยะยื่น (ม.)" hint="· 340/ม. · เว้น 0 = ไม่มี">
              <NumberInput value={sm.gearLen || 0} onChange={(v) => setObj("slide_motor", { gearLen: v })} placeholder="0" step={0.1} />
            </Field>
          )}
          </>)}
        </div>
      </Field>
    );
  }
  return null;
}

// ── ดรอปดาวน์รุ่นของชนิดมือจับที่เลือก (cmech/stainless/digihandle) — ตรง app.js renderAddonField เดิม (ก๊อปมาทั้งตาราง/เงื่อนไข) ──
function renderHandleModel(cur: string, prod: any, A: AddonsMap, setAddons: (fn: (a: AddonsMap) => AddonsMap) => void, set: (k: string, v: any) => void) {
  if (cur === "digihandle") {
    const digi: { n: string; p: number; nc?: number; jr?: number }[] = (R39DATA && (R39DATA as any).DIGI) || [];
    const jrOK = prod.id === "open_door" || /โซลิด/.test(prod.name || ""); // JR Prime เฉพาะบานเปิดยูโร/โซลิด (R3.9 jr:1)
    const isEuro = prod.id === "open_door"; // nc → +โช้ค เฉพาะบานเปิดยูโร (R3.9)
    return (
      <>
        <select
          value={A.digihandle || ""}
          onChange={(e) => {
            const opt = e.target.selectedOptions[0];
            const nc = opt && opt.dataset.nc === "1" ? 1 : 0;
            setAddons((old) => ({ ...old, digihandle: e.target.value, dgNc: nc }));
          }}
          className="w-full min-h-[44px] glass-soft rounded-lg px-3 py-2 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
        >
          <option value="">— ไม่ใส่ —</option>
          {digi.filter((d) => !(d.jr && !jrOK)).map((d) => (
            <option key={d.n} value={d.p} data-nc={d.nc && isEuro ? "1" : "0"}>
              {d.n} · {fmt(d.p)} บ.{d.nc && isEuro ? " +โช้ค5,000" : ""}
            </option>
          ))}
        </select>
        {!jrOK && <p className="text-[11px] text-amber-700 mt-1.5">JR Prime (24,900) ใช้ได้เฉพาะ ประตูบานเปิดยูโร/โซลิด วัน-ทู</p>}
      </>
    );
  }
  if (cur === "cmech") {
    // index ด้วย string จาก Object.keys() ตี type literal ที่ tsc อนุมานจาก engine.mjs แคบเกินจริง (ตัว .mjs ไม่มี .d.ts) — cast เป็น Record ที่นี่จุดเดียว
    const tiers = CMECH_TIERS as Record<string, { p: number; l: string }>;
    const isAwn = /กระทุ้ง/.test(prod.name || "");
    // สี Cmech 6 สี (ตรงเครื่องเดิม CMECH_COLORS) — สีชุบพิเศษ (ไม่ใช่ ขาว/ดำ) = ราคา special
    const COLORS = [
      { k: "White", n: "White", sp: false }, { k: "Black", n: "Black", sp: false },
      { k: "Silver", n: "Silver", sp: true }, { k: "Champagne", n: "Champagne", sp: true },
      { k: "Gold", n: "Gold", sp: true }, { k: "Bronze", n: "Bronze", sp: true },
    ];
    // แบบ ฝัง/เมโทร (awn ไม่มีแบบ) · ประตู/หน้าต่าง (default door สำหรับรุ่นประตู/บานเปิด) · สี → normal/special
    const isDoorish = /ประตู|บานเปิด|PC|สวิง|โซลิด|เปิด/.test(prod.name || "");
    const style: string = A.cmechStyle || "embed";
    const dw: string = A.cmechDoor || (isDoorish ? "door" : "window");
    const color: string = A.cmechColor || "White";
    const grade = COLORS.find((c) => c.k === color)?.sp ? "special" : "normal";
    const tierKey = isAwn ? `awn_${grade}` : `${style}_${dw}_${grade}`;
    // sync tier key เข้า A.cmech (engine คิดเงินจาก key นี้) ทุกครั้งที่เลือก
    const apply = (patch: Record<string, string>) => {
      setAddons((old) => {
        const st = patch.cmechStyle ?? (old.cmechStyle || "embed");
        const d = patch.cmechDoor ?? (old.cmechDoor || dw);
        const col = patch.cmechColor ?? (old.cmechColor || "White");
        const gr = COLORS.find((c) => c.k === col)?.sp ? "special" : "normal";
        const key = isAwn ? `awn_${gr}` : `${st}_${d}_${gr}`;
        return { ...old, ...patch, cmech: key };
      });
    };
    const priced = tiers[tierKey];
    return (
      <div className="space-y-2">
        {!isAwn && (
          <>
            <ChipRow items={[{ val: "embed", label: "ฝัง" }, { val: "metro", label: "เมโทร" }]} value={style} onChange={(v) => apply({ cmechStyle: v })} />
            <ChipRow items={[{ val: "door", label: "ประตู (2 ฝั่ง)" }, { val: "window", label: "หน้าต่าง (1 ฝั่ง)" }]} value={dw} onChange={(v) => apply({ cmechDoor: v })} />
          </>
        )}
        <ChipRow items={COLORS.map((c) => ({ val: c.k, label: c.n + (c.sp ? " ✦" : "") }))} value={color} onChange={(v) => apply({ cmechColor: v })} />
        <p className="text-[11px] text-ink-3">
          {priced ? `${priced.l} · ${fmt(priced.p)} บ.` : ""}{" "}
          <span className="opacity-70">(✦ = ชุบพิเศษ ราคาสูงกว่า)</span>
        </p>
      </div>
    );
  }
  if (cur === "stainless") {
    // เหตุผลเดียวกับ cmech ด้านบน — cast Record ให้ index ด้วย string ได้
    const tiers = STAINLESS_TIERS as Record<string, { p: number; l: string }>;
    return (
      <select
        value={A.stainless || ""}
        onChange={(e) => set("stainless", e.target.value)}
        className="w-full min-h-[44px] glass-soft rounded-lg px-3 py-2 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
      >
        <option value="">— ไม่ใส่ —</option>
        {Object.keys(tiers).map((k) => (
          <option key={k} value={k}>{tiers[k].l} · {fmt(tiers[k].p)}</option>
        ))}
      </select>
    );
  }
  return null;
}

function fmtNum(n: number) {
  return (n || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 });
}

/* ── ส่วนหลัก ── */
export default function AddonsSection({ prod, addons, setAddons, area, W, movePanes, color, form }: {
  prod: any; addons: AddonsMap; setAddons: (fn: (a: AddonsMap) => AddonsMap) => void; area: number; W: number; movePanes?: number; color?: string; form?: string;
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
            <AddonField key={ad} ad={ad} prod={prod} addons={addons} setAddons={setAddons} area={area} W={W} movePanes={movePanes ?? 1} color={color ?? "white"} form={form ?? ""} />
          ))}
        </div>
      ))}
    </div>
  );
}
