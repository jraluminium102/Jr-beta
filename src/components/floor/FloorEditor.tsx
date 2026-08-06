"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Icon from "@/components/Icon";
import { baht } from "@/lib/money";
import { api } from "@/lib/api";
import { FloorPlanSvg } from "./FloorPlanSvg";
import {
  planFloor, draftItems, quickAdds, sumItems, groupItems,
  PILE_TYPES, DEFAULT_CONTRACTOR,
} from "@/lib/floor-calc/engine.mjs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Item = any;
type JobOpt = { id: string; job_code: string; customer_name: string; floor_note?: string | null };

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/**
 * หน้าคิดราคางานพื้น — สร้าง/แก้ใบเสนอ
 *
 * โฟลว์ตามที่เจ้าของสั่ง (6 ส.ค.69):
 *   กรอกแค่ กว้าง × ยาว → ระบบคิดเข็ม+คานให้ (ดูผังได้ทันที)
 *   → กด "สร้างรายการตั้งต้น" → ตารางรายการที่แก้ทับ/ลบ/เพิ่มเอง/แบ่งหมวดได้
 *   → บันทึก → พิมพ์ใบเสนอ (ฟอร์มช่าง) / ใบเบิกงวด
 */
export default function FloorEditor({
  mode, initial, jobs,
}: {
  mode: "create" | "edit";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initial?: any;
  jobs: JobOpt[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const initCalc = initial?.calc ?? {};
  const [width, setWidth] = useState<string>(String(initCalc.width ?? "3"));
  const [length, setLength] = useState<string>(String(initCalc.length ?? "6"));
  const [pileKey, setPileKey] = useState<string>(String(initCalc.pile_key ?? "i18"));

  const [jobId, setJobId] = useState<string>(initial?.job_id ?? "");
  const [cName, setCName] = useState(initial?.customer_snapshot?.name ?? "");
  const [cAddr, setCAddr] = useState(initial?.customer_snapshot?.address ?? "");
  const [cPhone, setCPhone] = useState(initial?.customer_snapshot?.phone ?? "");
  const [issueDate, setIssueDate] = useState(initial?.issue_date ?? todayISO());
  const [note, setNote] = useState(initial?.note ?? "");

  const [items, setItems] = useState<Item[]>(
    (initial?.floor_quotation_items ?? [])
      .slice()
      .sort((a: Item, b: Item) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
  );

  const plan = useMemo(() => planFloor(num(width) || 0.1, num(length) || 0.1), [width, length]);
  const total = useMemo(() => sumItems(items), [items]);
  const groups = useMemo(() => groupItems(items.map((it, i) => ({ ...it, sort_order: i }))), [items]);

  // ── รายการ ──
  const setItem = (i: number, patch: Partial<Item>) => {
    setItems((prev) => prev.map((it, idx) => {
      if (idx !== i) return it;
      const next = { ...it, ...patch };
      // ค่าวัสดุ/ค่าแรง กรอกแล้ว → ราคางาน = ผลบวก (ตามฟอร์มช่าง) · ไม่กรอกก็แก้ราคางานตรง ๆ ได้
      if ("material_price" in patch || "labor_price" in patch) {
        const mat = next.material_price === "" || next.material_price == null ? null : num(next.material_price);
        const lab = next.labor_price === "" || next.labor_price == null ? null : num(next.labor_price);
        if (mat != null || lab != null) next.unit_price = r2((mat ?? 0) + (lab ?? 0));
      }
      next.line_total = r2(num(next.qty) * num(next.unit_price));
      return next;
    }));
  };
  const addItem = (item: Item) => setItems((p) => [...p, { ...item, group_label: p.at(-1)?.group_label ?? "" }]);
  const delItem = (i: number) => setItems((p) => p.filter((_, idx) => idx !== i));
  const moveItem = (i: number, dir: -1 | 1) => setItems((p) => {
    const j = i + dir;
    if (j < 0 || j >= p.length) return p;
    const c = p.slice();
    [c[i], c[j]] = [c[j], c[i]];
    return c;
  });

  const buildDraft = () => {
    const next = draftItems(plan, pileKey);
    setItems((prev) => {
      // เก็บรายการที่พิมพ์เองไว้ (source=manual) แทนที่เฉพาะส่วนที่ระบบคิด
      const keep = prev.filter((it) => it.source === "manual");
      return [...next, ...keep];
    });
  };

  // ── บันทึก ──
  const save = async () => {
    setErr(null);
    if (!cName.trim()) return setErr("กรุณากรอกชื่อลูกค้า");
    if (items.length === 0) return setErr("ยังไม่มีรายการ — กด “สร้างรายการตั้งต้น” หรือเพิ่มเอง");
    if (items.some((it) => !String(it.name ?? "").trim())) return setErr("มีรายการที่ยังไม่ได้ใส่ชื่องาน");

    setSaving(true);
    const payload = {
      customer: { name: cName, address: cAddr, phone: cPhone },
      job_id: jobId || null,
      issue_date: issueDate,
      note,
      calc: {
        width: num(width), length: num(length), pile_key: pileKey,
        rows_w: plan.rowsW, rows_l: plan.rowsL, piles: plan.piles,
        beam_len: plan.beamLen, area: plan.area,
      },
      items: items.map((it, i) => ({ ...it, sort_order: i })),
      ...(mode === "create" ? { contractor: DEFAULT_CONTRACTOR } : {}),
    };
    try {
      // api client เติม prefix /api ให้เอง และคืน { data } — ห้ามใส่ /api ซ้ำ
      if (mode === "create") {
        const { data } = await api.post<{ id: number }>("/floor-quotations", payload);
        router.push(`/floor-works/${data.id}`);
      } else {
        await api.patch(`/floor-quotations/${initial.id}`, payload);
        router.refresh();
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const pickJob = (id: string) => {
    setJobId(id);
    const j = jobs.find((x) => x.id === id);
    if (j && !cName.trim()) setCName(j.customer_name ?? "");
  };

  const cell = "border border-gray-200 px-2 py-1.5 align-top";
  const inp = "w-full bg-transparent outline-none focus:bg-amber-50/60 rounded px-1";

  return (
    <div className="space-y-5">
      {err && (
        <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-2.5 text-sm text-red-800">{err}</div>
      )}

      {/* ═══ 1. ขนาดพื้นที่ + ผัง ═══ */}
      <section className="card p-4">
        <h2 className="font-bold text-ink mb-3 flex items-center gap-2">
          <Icon name="ruler" size={18} /> ขนาดพื้นที่
          <span className="text-xs font-normal text-ink-3">กรอกแค่ กว้าง × ยาว — ระบบคิดเข็ม/คานให้เอง</span>
        </h2>
        <div className="grid md:grid-cols-[minmax(0,1fr)_320px] gap-4">
          <div className="rounded-xl border border-gray-200 bg-white p-2">
            <FloorPlanSvg width={num(width) || 0.1} length={num(length) || 0.1} />
            <div className="flex flex-wrap gap-4 text-xs text-ink-2 px-2 pb-1">
              <span><i className="inline-block w-3 h-3 rounded-sm align-[-1px] mr-1" style={{ background: "#b3151d" }} />เสาเข็ม</span>
              <span><i className="inline-block w-3 h-3 rounded-sm align-[-1px] mr-1" style={{ background: "#2f6f8f" }} />คาน</span>
              <span className="text-ink-3">ตัวเลขแดง = ระยะระหว่างเข็ม · เทา = ระยะยื่นปลาย</span>
            </div>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-xs text-ink-3">กว้าง (ม.)</span>
                <input type="number" step="0.1" min="0.5" value={width}
                  onChange={(e) => setWidth(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 tabular-nums font-semibold" />
              </label>
              <label className="block">
                <span className="text-xs text-ink-3">ยาว (ม.)</span>
                <input type="number" step="0.1" min="0.5" value={length}
                  onChange={(e) => setLength(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 tabular-nums font-semibold" />
              </label>
            </div>
            <label className="block">
              <span className="text-xs text-ink-3">ชนิดเข็ม</span>
              <select value={pileKey} onChange={(e) => setPileKey(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2">
                {PILE_TYPES.map((p: { key: string; label: string; price: number; note?: string }) => (
                  <option key={p.key} value={p.key}>
                    {p.label} · {baht(p.price)}{p.note ? ` (${p.note})` : ""}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                ["พื้นที่", `${plan.area.toFixed(1)}`, "ตร.ม."],
                ["เสาเข็ม", `${plan.piles}`, "ต้น"],
                ["คานรวม", `${plan.beamLen.toFixed(1)}`, "ม."],
              ].map(([k, v, u]) => (
                <div key={k} className="rounded-lg bg-gray-50 border border-gray-200 py-2">
                  <div className="text-[10px] text-ink-3">{k}</div>
                  <div className="font-bold tabular-nums text-lg leading-tight">{v}</div>
                  <div className="text-[10px] text-ink-3">{u}</div>
                </div>
              ))}
            </div>

            {plan.tooTight && (
              <div className="rounded-lg bg-amber-50 border border-amber-300 px-3 py-2 text-xs text-amber-900">
                ด้านแคบกว่า 1 ม. — วางเข็มให้ห่างขั้นต่ำ 1 ม. ไม่ได้ ตรวจหน้างานก่อนใช้ราคานี้
              </div>
            )}

            <button type="button" onClick={buildDraft}
              className="press w-full rounded-xl bg-brand text-white font-semibold py-2.5">
              สร้างรายการตั้งต้น
            </button>
            <p className="text-[11px] text-ink-3">
              เข็ม/ขุด/ฟุตติ้ง/คาน คิดจากผัง · ทราย/เทพื้น/กระเบื้อง เป็นค่าแนะนำตามพื้นที่ — แก้ทับได้ทุกช่อง
              <br />รายการที่พิมพ์เองไว้แล้วจะไม่ถูกลบ
            </p>
          </div>
        </div>
      </section>

      {/* ═══ 2. ลูกค้า ═══ */}
      <section className="card p-4">
        <h2 className="font-bold text-ink mb-3 flex items-center gap-2"><Icon name="users" size={18} /> ลูกค้า</h2>
        <div className="grid md:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs text-ink-3">ผูกงานในระบบ (เฉพาะงานที่ทำพื้นโดย JR)</span>
            <select value={jobId} onChange={(e) => pickJob(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2">
              <option value="">— ไม่ผูก (ลูกค้านอกระบบ) —</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>{j.job_code} · {j.customer_name}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-ink-3">ชื่อลูกค้า *</span>
            <input value={cName} onChange={(e) => setCName(e.target.value)}
              placeholder="เช่น คุณพิทยารัตน์"
              className="w-full rounded-lg border border-gray-300 px-3 py-2" />
          </label>
          <label className="block md:col-span-2">
            <span className="text-xs text-ink-3">ที่อยู่</span>
            <input value={cAddr} onChange={(e) => setCAddr(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2" />
          </label>
          <label className="block">
            <span className="text-xs text-ink-3">เบอร์โทร</span>
            <input value={cPhone} onChange={(e) => setCPhone(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2" />
          </label>
          <label className="block">
            <span className="text-xs text-ink-3">วันที่ออกเอกสาร</span>
            <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2" />
          </label>
        </div>
      </section>

      {/* ═══ 3. รายการ ═══ */}
      <section className="card p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <h2 className="font-bold text-ink flex items-center gap-2">
            <Icon name="clipboard" size={18} /> รายการ
            <span className="text-xs font-normal text-ink-3">{items.length} รายการ · แก้ทับได้ทุกช่อง</span>
          </h2>
          <div className="flex gap-1.5 flex-wrap">
            {quickAdds(plan.area).map((qa: { label: string; item: Item }) => (
              <button key={qa.label} type="button" onClick={() => addItem(qa.item)}
                className="press rounded-full border border-gray-300 px-3 py-1 text-xs font-medium hover:border-brand hover:text-brand">
                + {qa.label}
              </button>
            ))}
          </div>
        </div>

        {items.length === 0 ? (
          <p className="text-sm text-ink-3 py-8 text-center">
            ยังไม่มีรายการ — กด “สร้างรายการตั้งต้น” ด้านบน หรือกดปุ่ม + เพิ่มเอง
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse" style={{ minWidth: 900 }}>
              <thead>
                <tr style={{ background: "#faedf0", color: "#a8425a" }}>
                  <th className={`${cell} text-center`} style={{ width: 34 }}>#</th>
                  <th className={`${cell} text-center`}>รายการ</th>
                  <th className={`${cell} text-center`} style={{ width: 130 }}>หมวด</th>
                  <th className={`${cell} text-center`} style={{ width: 62 }}>ปริมาณ</th>
                  <th className={`${cell} text-center`} style={{ width: 66 }}>หน่วย</th>
                  <th className={`${cell} text-center`} style={{ width: 82 }}>ค่าวัสดุ</th>
                  <th className={`${cell} text-center`} style={{ width: 82 }}>ค่าแรง</th>
                  <th className={`${cell} text-center`} style={{ width: 90 }}>ราคางาน</th>
                  <th className={`${cell} text-center`} style={{ width: 96 }}>รวม</th>
                  <th className={`${cell} text-center`} style={{ width: 84 }}>หมายเหตุ</th>
                  <th className={`${cell} text-center`} style={{ width: 72 }} />
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i} className={it.source === "auto" ? "bg-sky-50/40" : ""}>
                    <td className={`${cell} text-center tabular-nums text-ink-3`}>{i + 1}</td>
                    <td className={cell}>
                      <textarea value={it.name ?? ""} rows={Math.min(4, Math.ceil((it.name?.length ?? 0) / 60) || 1)}
                        onChange={(e) => setItem(i, { name: e.target.value })}
                        className={`${inp} resize-y`} placeholder="ชื่องาน" />
                      {it.source === "auto" && (
                        <span className="text-[10px] text-sky-700">ระบบคิดจากผัง — แก้ขนาดด้านบนแล้วกดสร้างใหม่จะทับค่านี้</span>
                      )}
                    </td>
                    <td className={cell}>
                      <input value={it.group_label ?? ""} list="floor-groups"
                        onChange={(e) => setItem(i, { group_label: e.target.value })}
                        className={inp} placeholder="(ไม่มีหมวด)" />
                    </td>
                    <td className={cell}>
                      <input type="number" step="0.01" value={it.qty ?? 1}
                        onChange={(e) => setItem(i, { qty: e.target.value })}
                        className={`${inp} text-right tabular-nums`} />
                    </td>
                    <td className={cell}>
                      <input value={it.unit ?? "งาน"} onChange={(e) => setItem(i, { unit: e.target.value })}
                        className={`${inp} text-center`} />
                    </td>
                    <td className={cell}>
                      <input type="number" step="0.01" value={it.material_price ?? ""}
                        onChange={(e) => setItem(i, { material_price: e.target.value })}
                        className={`${inp} text-right tabular-nums`} placeholder="—" />
                    </td>
                    <td className={cell}>
                      <input type="number" step="0.01" value={it.labor_price ?? ""}
                        onChange={(e) => setItem(i, { labor_price: e.target.value })}
                        className={`${inp} text-right tabular-nums`} placeholder="—" />
                    </td>
                    <td className={cell}>
                      <input type="number" step="0.01" value={it.unit_price ?? 0}
                        onChange={(e) => setItem(i, { unit_price: e.target.value })}
                        className={`${inp} text-right tabular-nums font-medium`} />
                    </td>
                    <td className={`${cell} text-right tabular-nums font-semibold`}>{baht(num(it.line_total))}</td>
                    <td className={cell}>
                      <input value={it.remark ?? ""} list="floor-remarks"
                        onChange={(e) => setItem(i, { remark: e.target.value })}
                        className={`${inp} text-center`} placeholder="—" />
                    </td>
                    <td className={`${cell} text-center whitespace-nowrap`}>
                      <button type="button" onClick={() => moveItem(i, -1)} disabled={i === 0}
                        className="press px-1 text-ink-3 disabled:opacity-25" aria-label="เลื่อนขึ้น">↑</button>
                      <button type="button" onClick={() => moveItem(i, 1)} disabled={i === items.length - 1}
                        className="press px-1 text-ink-3 disabled:opacity-25" aria-label="เลื่อนลง">↓</button>
                      <button type="button" onClick={() => delItem(i)}
                        className="press px-1 text-red-600" aria-label="ลบรายการ">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <datalist id="floor-groups">
              {[...new Set(items.map((it) => String(it.group_label ?? "").trim()).filter(Boolean))].map((g) => (
                <option key={g} value={g} />
              ))}
              <option value="งานทำพื้นโครงสร้าง" />
              <option value="งานส่วนหน้าบ้าน" />
              <option value="งานส่วนห้องเก็บของ" />
            </datalist>
            <datalist id="floor-remarks"><option value="งานเพิ่ม" /></datalist>
          </div>
        )}

        {/* ยอดรวม (แยกหมวดถ้ามีมากกว่า 1) */}
        {items.length > 0 && (
          <div className="flex justify-end mt-3">
            <table className="text-sm">
              <tbody>
                {groups.length > 1 && groups.map((g: { label: string; subtotal: number }) => (
                  <tr key={g.label}>
                    <td className="pr-10 py-0.5 text-right text-ink-3">
                      ยอดรวม {g.label || "(ไม่มีหมวด)"}
                    </td>
                    <td className="text-right tabular-nums">{baht(g.subtotal)} บาท</td>
                  </tr>
                ))}
                <tr className="font-bold text-lg border-t" style={{ color: "#a8425a" }}>
                  <td className="pr-10 py-1 text-right border-t">ยอดโดยรวมสุทธิ</td>
                  <td className="text-right tabular-nums border-t">{baht(total)} บาท</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ═══ 4. หมายเหตุ + บันทึก ═══ */}
      <section className="card p-4 space-y-3">
        <label className="block">
          <span className="text-xs text-ink-3">หมายเหตุเพิ่มเติม (ขึ้นท้ายใบ ต่อจากหมายเหตุมาตรฐาน)</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
            className="w-full rounded-lg border border-gray-300 px-3 py-2" />
        </label>
        <div className="flex gap-2 flex-wrap justify-end">
          <Link href="/floor-works" className="press rounded-xl border border-gray-300 px-4 py-2.5 text-sm">ยกเลิก</Link>
          {mode === "edit" && (
            <>
              <Link href={`/floor-works/${initial.id}/print`} target="_blank"
                className="press rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium">
                พิมพ์ใบเสนอ
              </Link>
              <Link href={`/floor-works/${initial.id}/installments`}
                className="press rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium">
                ใบเบิกงวด
              </Link>
            </>
          )}
          <button type="button" onClick={save} disabled={saving}
            className="press rounded-xl bg-brand text-white font-semibold px-6 py-2.5 disabled:opacity-50">
            {saving ? "กำลังบันทึก…" : mode === "create" ? "บันทึกใบเสนอ" : "บันทึกการแก้ไข"}
          </button>
        </div>
      </section>
    </div>
  );
}
