"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Plus, X } from "@/components/ui/icons";
import OptionsEditor from "./OptionsEditor";
import type { SetOption } from "@/app/api/production-set-options/route";

// ── ตัวเลือกดรอปดาวน์ ──────────────────────────────────────────────────────
// ของจริงมาจาก DB (ตาราง production_set_options — 0099) ออฟฟิศเพิ่ม/ลบเองได้จากปุ่ม ⚙ ข้างป้าย
// ค่าข้างล่างเป็น "ตัวสำรอง" ใช้เฉพาะตอน 0099 ยังไม่รัน/โหลดไม่ได้ → หน้าไม่พังและยังกรอกงานได้
// (ค่าตรงกับ seed ใน 0099 ซึ่งถอดมาจาก dataValidation ของ Excel จริง "แผนงานผลิตโรง1.xlsx")
const FALLBACK: Record<string, string[]> = {
  design_received: ["ได้รับแบบ", "ได้แบบไม่ครบ", "ยังไม่ได้รับแบบ"],
  frame_status: ["เบิกสต๊อกทั้งหมด", "สั่งแล้ว รอของ", "ของมาแล้ว", "ขึ้นโครงโรงงาน1", "ขึ้นโครงโรงงาน2", "ขึ้นโครงโรงงาน3", "มือจับลูกค้า"],
  mat_equipment: ["เบิกสต๊อกทั้งหมด", "สั่งแล้ว รอของ", "ของมาแล้ว", "มือจับลูกค้า"],
  mat_alu_normal: ["เบิกสต๊อกทั้งหมด", "สั่งแล้ว รอของ", "ของมาแล้ว", "มือจับลูกค้า"],
  mat_alu_painted: ["เบิกสต๊อกทั้งหมด", "สั่งแล้ว รอของ", "ของมาแล้ว", "มือจับลูกค้า"],
  glass_order: ["รอวัด", "วัดแล้ว", "สั่งแล้ว รอของ", "มาแล้ว", "มายังไม่ครบ"],
  glass_installed: ["ใส่แล้ว", "ยังไม่ใส่"],
  screen_type: ["มุ้งจีบ", "มุ้ง JR", "มุ้งจีบ+มุ้ง JR", "มุ้งนิรภัย"],
  screen_installed: ["มาแล้ว", "ใส่แล้ว", "ใส่ไม่ครบ"],
  qc_before_glass: ["ผ่าน", "ไม่ผ่าน"],
  qc_after_glass: ["ผ่าน", "ไม่ผ่าน"],
};

// timestamptz → "24/06/2026 14:30" (ค.ศ. เต็ม)
function fmtWhen(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

type SetRow = { id: number; job_id: string } & Record<string, any>;

// ขนาดตัวหนังสือ: เจ้าของแจ้ง 16 ก.ค.2569 ว่า "ฟ้อนเล็ก อ่านยาก" → ช่อง 12→14px, ป้าย 10→11.5px
// (คู่กับโมดัลที่ขยายเป็น max-w-3xl แล้ว — ที่กว้างพอให้ตัวใหญ่ขึ้นได้โดยตารางไม่แตก)
const fieldCls =
  "w-full bg-white/8 text-white text-[16px] px-2.5 py-2.5 rounded-lg border border-white/12 focus:border-sky-300/60 outline-none disabled:opacity-60";

// ป้าย + ช่อง · ถ้าส่ง onEditOpts มา = ช่องนี้เป็นดรอปดาวน์ที่แก้ตัวเลือกได้ → โชว์ปุ่ม ⚙ ข้างป้าย
function F({ label, children, onEditOpts }: { label: string; children: React.ReactNode; onEditOpts?: () => void }) {
  return (
    <label className="block">
      <span className="flex items-center gap-1 text-[13px] mb-1" style={{ color: "var(--t-low)" }}>
        <span className="truncate">{label}</span>
        {onEditOpts && (
          <button type="button" onClick={(e) => { e.preventDefault(); onEditOpts(); }}
            title={`เพิ่ม/ลบตัวเลือกของ "${label}"`} aria-label={`เพิ่ม/ลบตัวเลือกของ ${label}`}
            className="shrink-0 text-white/35 hover:text-sky-300 leading-none">⚙</button>
        )}
      </span>
      {children}
    </label>
  );
}

export function ProductionSetsSection({ jobId, canWrite }: { jobId: string; canWrite: boolean }) {
  const qc = useQueryClient();
  const key = ["production-sets", jobId];
  const { data, isLoading } = useQuery({ queryKey: key, queryFn: () => api.get<SetRow[]>(`/production-sets?job_id=${jobId}`) });
  const sets = data?.data ?? [];
  // ประวัติสเปคกระจก (เลือกจากที่เคยบันทึก) — datalist
  const { data: specRes } = useQuery({ queryKey: ["glass-specs"], queryFn: () => api.get<string[]>("/production-sets/glass-specs"), staleTime: 60_000 });
  const glassSpecHistory = specRes?.data ?? [];
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false); // แฟลช "บันทึกแล้ว ✓" หลังเซฟสำเร็จ (auto-save เงียบ → ให้ feedback)
  const [editKeys, setEditKeys] = useState<Record<string, boolean>>({}); // ช่อง mark ที่กด "แก้" override อยู่
  const [optField, setOptField] = useState<{ key: string; label: string } | null>(null); // แผงจัดการตัวเลือกที่เปิดอยู่

  // ตัวเลือกดรอปดาวน์จาก DB (0099) — ยังไม่รัน migration → data ว่าง แล้วตกไปใช้ FALLBACK
  const optKey = ["production-set-options"];
  const { data: optRes } = useQuery({ queryKey: optKey, queryFn: () => api.get<SetOption[]>("/production-set-options"), staleTime: 60_000 });
  const allOpts = optRes?.data ?? [];
  // 0099 ยังไม่รัน → API คืน migrated:false · ดรอปดาวน์ยังใช้ FALLBACK ได้ แต่ "เพิ่ม/ลบ" ยังไม่ได้
  const optsMigrated = optRes?.meta?.migrated !== false;
  const optsOf = (field: string): SetOption[] => allOpts.filter((o) => o.field_key === field);
  /** ตัวเลือกสำหรับ <select> — "" (ว่าง) นำหน้าเสมอ · ไม่มีใน DB → ใช้ค่าสำรอง */
  const valuesOf = (field: string): string[] => {
    const fromDb = optsOf(field).map((o) => o.value);
    return ["", ...(fromDb.length ? fromDb : (FALLBACK[field] ?? []))];
  };
  const refetchOpts = () => qc.invalidateQueries({ queryKey: optKey });
  /** ปุ่ม ⚙ ข้างป้าย — เฉพาะคนที่แก้ได้ (ช่าง/คนอ่านอย่างเดียวไม่ต้องเห็น) */
  const openOpts = (key: string, label: string) => (canWrite ? () => setOptField({ key, label }) : undefined);

  async function save(id: number, field: string, value: any) {
    try {
      await api.patch(`/production-sets/${id}`, { [field]: value === "" ? null : value });
      qc.invalidateQueries({ queryKey: key }); // refetch → เห็นค่าล่าสุด/ใครกด (กัน stale ทับ)
      setSaved(true); setTimeout(() => setSaved(false), 1600); // แฟลชป้าย "บันทึกแล้ว ✓"
    } catch { /* keep typed value */ }
  }
  async function add() {
    setBusy(true);
    try { await api.post("/production-sets", { job_id: jobId, set_label: `ชุด ${sets.length + 1}` }); qc.invalidateQueries({ queryKey: key }); }
    finally { setBusy(false); }
  }
  async function del(id: number) {
    if (!confirm("ลบชุดงานนี้?")) return;
    await api.del(`/production-sets/${id}`); qc.invalidateQueries({ queryKey: key });
  }
  // ใส่วันที่/คนวัด ทีเดียว → เติมทุกชุดของงานนี้ (แก้รายชุดทีหลังได้)
  async function fillAll(field: string, value: string) {
    try {
      await api.post("/production-sets/fill-all", { job_id: jobId, field, value });
      qc.invalidateQueries({ queryKey: key });
      setSaved(true); setTimeout(() => setSaved(false), 1600);
    } catch { /* ignore */ }
  }
  // ค่าที่ทุกชุดตรงกัน → โชว์ในแถบรวม · ถ้าต่างกัน = "" (โชว์ placeholder "หลายค่า")
  const commonVal = (field: string) => {
    if (!sets.length) return "";
    const first = String(sets[0][field] ?? "");
    return sets.every((s) => String(s[field] ?? "") === first) ? first : "";
  };

  // helper สร้าง field
  const txt = (s: SetRow, f: string) => <input defaultValue={s[f] ?? ""} disabled={!canWrite} onBlur={(e) => e.target.value !== String(s[f] ?? "") && save(s.id, f, e.target.value)} className={fieldCls} />;
  const date = (s: SetRow, f: string) => <input type="date" defaultValue={s[f] ?? ""} disabled={!canWrite} onBlur={(e) => save(s.id, f, e.target.value)} className={fieldCls} />;
  // ค่าที่มีอยู่แต่ไม่อยู่ในลิสต์ (ของเก่า/พิมพ์มาจาก Excel) ต้องใส่เป็นตัวเลือกด้วยเสมอ
  // ไม่งั้น <select defaultValue> ที่ไม่ match จะเด้งไปตัวแรก = จอโชว์ "—" ทั้งที่ DB มีค่าอยู่ (หลอกตา)
  const withCurrent = (opts: string[], cur: unknown) => {
    const v = String(cur ?? "");
    return v && !opts.includes(v) ? [...opts, v] : opts;
  };
  const sel = (s: SetRow, f: string, opts: string[]) => (
    <select defaultValue={s[f] ?? ""} disabled={!canWrite} onChange={(e) => save(s.id, f, e.target.value)} className={fieldCls}>
      {withCurrent(opts, s[f]).map((o) => <option key={o} value={o}>{o || "—"}</option>)}
    </select>
  );
  // สเปคกระจก — พิมพ์เอง หรือเลือกจากประวัติ (datalist)
  const glassSpec = (s: SetRow) => (
    <input list="glass-spec-history" defaultValue={s.glass_spec ?? ""} disabled={!canWrite} placeholder="พิมพ์ / เลือกจากประวัติ"
      onBlur={(e) => e.target.value !== String(s.glass_spec ?? "") && save(s.id, "glass_spec", e.target.value)}
      className={fieldCls + " placeholder-white/30"} />
  );

  // ช่องที่ "ช่างกดเอง" — โชว์ read-only + ใครกด/เมื่อไหร่ · กด "แก้" เพื่อ override (กันเขียนทับช่างโดยไม่ตั้งใจ)
  const DONE_VALS: Record<string, string> = { design_received: "ได้รับแบบ", glass_installed: "ใส่แล้ว", qc_before_glass: "ผ่าน", qc_after_glass: "ผ่าน" };
  const markRO = (s: SetRow, f: string, byF: string, atF: string, opts: string[]) => {
    const key = `${s.id}.${f}`;
    if (canWrite && editKeys[key]) {
      return (
        <div className="flex items-center gap-1">
          <select defaultValue={s[f] ?? ""} onChange={(e) => save(s.id, f, e.target.value)} className={fieldCls}>
            {withCurrent(opts, s[f]).map((o) => <option key={o} value={o}>{o || "—"}</option>)}
          </select>
          <button type="button" onClick={() => setEditKeys((k) => ({ ...k, [key]: false }))} className="text-[12px] text-emerald-300 shrink-0 px-1">เสร็จ</button>
        </div>
      );
    }
    const val = (s[f] ?? "") as string;
    const done = val === DONE_VALS[f];
    const by = s[byF] as string | null;
    const at = s[atF] as string | null;
    return (
      <div className="w-full bg-white/5 rounded-lg border border-white/10 px-2 py-1.5">
        <div className="flex items-center justify-between gap-1">
          <span className={`text-[16px] ${done ? "text-emerald-200 font-medium" : "text-white/55"}`}>{val || "— ยังไม่กด —"}</span>
          {canWrite && <button type="button" onClick={() => setEditKeys((k) => ({ ...k, [key]: true }))} className="text-[12px] text-sky-300/80 underline shrink-0">แก้</button>}
        </div>
        {by && <div className="text-[11px] mt-0.5" style={{ color: "var(--t-low)" }}>โดย {by}{at ? ` · ${fmtWhen(at)}` : ""}</div>}
      </div>
    );
  };

  return (
    <div className="mt-3 glass-card rounded-2xl p-4 border border-white/10">
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-lg font-semibold text-white flex items-center gap-2">
          รายละเอียดผลิต (ชุดงาน)
          <span className={`text-[12px] font-normal text-emerald-300 transition-opacity duration-300 ${saved ? "opacity-100" : "opacity-0"}`}>บันทึกแล้ว ✓</span>
        </span>
        {canWrite && (
          <button onClick={add} disabled={busy} className="focusable pressable inline-flex items-center gap-1 text-[14px] bg-sky-500/80 hover:bg-sky-400 text-white rounded-lg px-3 py-2 min-h-[38px] disabled:opacity-50"><Plus size={14} /> เพิ่มชุด</button>
        )}
      </div>

      {/* ประวัติสเปคกระจก (ใช้ร่วมทุกชุด) */}
      <datalist id="glass-spec-history">
        {glassSpecHistory.map((g) => <option key={g} value={g} />)}
      </datalist>

      {/* แผงจัดการตัวเลือกดรอปดาวน์ (กด ⚙ ข้างป้าย) */}
      {optField && (
        <OptionsEditor
          label={optField.label}
          fieldKey={optField.key}
          options={optsOf(optField.key)}
          migrated={optsMigrated}
          fallback={FALLBACK[optField.key] ?? []}
          onClose={() => setOptField(null)}
          onChanged={refetchOpts}
        />
      )}

      {isLoading ? (
        <div className="text-[13px] py-2" style={{ color: "var(--t-low)" }}>กำลังโหลด…</div>
      ) : sets.length === 0 ? (
        <div className="text-[13px] py-2" style={{ color: "var(--t-low)" }}>ยังไม่มีชุดงาน — กด "เพิ่มชุด" เพื่อเริ่มกรอกแผนผลิต</div>
      ) : (
        <>
          {/* 📅 ใส่วันที่ทีเดียว → เติมทุกชุด (แก้รายชุดด้านล่างได้) */}
          {canWrite && (
            <div className="mb-3 rounded-xl border border-sky-300/25 bg-sky-500/10 p-3">
              <div className="text-[13px] text-sky-100 mb-2 font-medium">📅 ใส่วันที่ทีเดียว — เติมให้ทุกชุด <span className="text-sky-200/60 font-normal">(แก้รายชุดด้านล่างได้)</span></div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {([
                  ["measure_actual", "วัดจริง", "date"],
                  ["measurer_name", "คนวัด", "text"],
                  ["must_finish_date", "ต้องผลิตเสร็จ", "date"],
                  ["glass_done_date", "ใส่กระจกเสร็จ", "date"],
                  ["install_date", "ติดตั้ง", "date"],
                ] as const).map(([f, label, type]) => {
                  const cv = commonVal(f);
                  const mixed = !cv && sets.some((s) => s[f]);
                  return (
                    <label key={f} className="block">
                      <span className="block text-[13px] mb-1" style={{ color: "var(--t-low)" }}>{label}</span>
                      <input key={f + cv} type={type} defaultValue={cv} placeholder={mixed ? "หลายค่า" : ""}
                        onBlur={(e) => e.target.value !== cv && fillAll(f, e.target.value)}
                        onChange={type === "date" ? (e) => e.target.value !== cv && fillAll(f, e.target.value) : undefined}
                        className={fieldCls + " placeholder-amber-200/60"} />
                    </label>
                  );
                })}
              </div>
            </div>
          )}
          <div className="space-y-3">
          {sets.map((s) => (
            <div key={s.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="flex items-center gap-2 mb-2.5">
                <input defaultValue={s.set_label ?? ""} disabled={!canWrite} placeholder="ชื่อชุด เช่น ชุด 1,4,5"
                  onBlur={(e) => e.target.value !== String(s.set_label ?? "") && save(s.id, "set_label", e.target.value)}
                  className="flex-1 bg-transparent text-white text-[17px] font-semibold border-b border-white/15 focus:border-sky-300/60 outline-none px-1 py-1" />
                {canWrite && <button onClick={() => del(s.id)} aria-label="ลบชุด" className="text-white/40 hover:text-rose-300 p-1"><X size={15} /></button>}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <F label="แบบถึงผลิต 👷 (ช่างกด)" onEditOpts={openOpts("design_received", "แบบถึงผลิต")}>{markRO(s, "design_received", "design_received_by", "design_received_at", valuesOf("design_received"))}</F>
                <F label="วันวัดจริง">{date(s, "measure_actual")}</F>
                <F label="คนวัด">{txt(s, "measurer_name")}</F>
                <F label="โครง/โรงงาน" onEditOpts={openOpts("frame_status", "โครง/โรงงาน")}>{sel(s, "frame_status", valuesOf("frame_status"))}</F>

                <F label="อุปกรณ์" onEditOpts={openOpts("mat_equipment", "อุปกรณ์")}>{sel(s, "mat_equipment", valuesOf("mat_equipment"))}</F>
                <F label="อลู ปกติ" onEditOpts={openOpts("mat_alu_normal", "อลู ปกติ")}>{sel(s, "mat_alu_normal", valuesOf("mat_alu_normal"))}</F>
                <F label="อลู อบสี" onEditOpts={openOpts("mat_alu_painted", "อลู อบสี")}>{sel(s, "mat_alu_painted", valuesOf("mat_alu_painted"))}</F>
                <F label="QC ก่อนใส่กระจก 👷 (ช่างกด)" onEditOpts={openOpts("qc_before_glass", "QC ก่อนใส่กระจก")}>{markRO(s, "qc_before_glass", "qc_before_by", "qc_before_at", valuesOf("qc_before_glass"))}</F>

                <div className="col-span-2"><F label="สเปคกระจก">{glassSpec(s)}</F></div>
                <F label="สั่งกระจก" onEditOpts={openOpts("glass_order", "สั่งกระจก")}>{sel(s, "glass_order", valuesOf("glass_order"))}</F>
                <F label="ใส่กระจก 👷 (ช่างกด)" onEditOpts={openOpts("glass_installed", "ใส่กระจก")}>{markRO(s, "glass_installed", "glass_installed_by", "glass_installed_at", valuesOf("glass_installed"))}</F>

                <F label="มุ้ง" onEditOpts={openOpts("screen_type", "มุ้ง")}>{sel(s, "screen_type", valuesOf("screen_type"))}</F>
                <F label="ใส่มุ้ง" onEditOpts={openOpts("screen_installed", "ใส่มุ้ง")}>{sel(s, "screen_installed", valuesOf("screen_installed"))}</F>
                <F label="QC หลังใส่กระจก 👷 (ช่างกด)" onEditOpts={openOpts("qc_after_glass", "QC หลังใส่กระจก")}>{markRO(s, "qc_after_glass", "qc_after_by", "qc_after_at", valuesOf("qc_after_glass"))}</F>
                <F label="ต้องผลิตเสร็จ">{date(s, "must_finish_date")}</F>

                <F label="ใส่กระจกเสร็จ">{date(s, "glass_done_date")}</F>
                <F label="เสร็จจริง">{date(s, "actual_done_date")}</F>
                <F label="วันติดตั้ง">{date(s, "install_date")}</F>
                <div className="col-span-2 sm:col-span-1"><F label="หมายเหตุ">{txt(s, "note")}</F></div>
              </div>
            </div>
          ))}
          {/* ปุ่มเพิ่มชุดด้านล่าง — เพิ่มต่อจากชุดสุดท้ายได้เลย ไม่ต้อง scroll ขึ้นไปหัวตาราง */}
          {canWrite && (
            <button onClick={add} disabled={busy}
              className="focusable pressable w-full inline-flex items-center justify-center gap-1.5 text-[15px] border border-dashed border-sky-300/40 hover:border-sky-300/70 hover:bg-sky-500/10 text-sky-200 rounded-xl px-3 py-3 min-h-[46px] disabled:opacity-50">
              <Plus size={16} /> เพิ่มชุด
            </button>
          )}
          </div>
        </>
      )}
    </div>
  );
}
