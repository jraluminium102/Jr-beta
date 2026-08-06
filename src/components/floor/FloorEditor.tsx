"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Icon from "@/components/Icon";
import { baht } from "@/lib/money";
import { api } from "@/lib/api";
import { FloorPlanSvg } from "./FloorPlanSvg";
import ImportQuoteButton from "./ImportQuoteButton";
import { FloorQuoteSheet } from "./FloorQuoteSheet";
import { fixThai } from "@/lib/floor-calc/thai-fix";
import {
  planFloor, draftItems, quickAdds,
  PILE_TYPES, DEFAULT_CONTRACTOR,
} from "@/lib/floor-calc/engine.mjs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Item = any;
type JobOpt = { id: string; job_code: string; customer_name: string; floor_note?: string | null };

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
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

  // แก้รายการทั้งหมดทำใน <FloorQuoteSheet> (บนกระดาษ A4 โดยตรง) — ที่นี่เหลือแค่ปุ่มเพิ่มลัด
  const addItem = (item: Item) => setItems((p) => [...p, { ...item, group_label: p.at(-1)?.group_label ?? "" }]);

  /**
   * นำเข้าจากไฟล์ผู้รับเหมา — ราคาใช้ตามไฟล์ทั้งหมด (เจ้าของสั่ง "ไม่เกี่ยวกับราคาในเว็บ แค่จัดฟอร์ม")
   * suggestWords = คำกลุ่ม "ไม่แน่ใจ" ที่ผู้ใช้ติ๊กเลือกให้แก้ (กลุ่มมั่นใจแก้มาแล้วจากฝั่ง API)
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyImport = (p: any, suggestWords: string[]) => {
    const applyPicked = (s: string) => {
      if (!suggestWords.length) return s;
      // ใช้เฉพาะกฎกลุ่ม "เสนอ" ที่ผู้ใช้ติ๊ก — เทียบจากคำต้นทางที่โชว์ในจอตรวจ
      const full = fixThai(s, true);
      return suggestWords.some((w) => s.includes(w)) ? full.text : s;
    };
    setItems(p.items.map((it: Item) => ({ ...it, name: applyPicked(it.name), source: "manual" })));
    if (p.customer?.name) setCName(applyPicked(p.customer.name));
    if (p.customer?.address) setCAddr(applyPicked(p.customer.address));
    if (p.customer?.phone) setCPhone(p.customer.phone);
    setErr(null);
  };

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

  return (
    <div className="space-y-5">
      {err && (
        <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-2.5 text-sm text-red-800">{err}</div>
      )}

      {/* ═══ 0. นำเข้าจากไฟล์ผู้รับเหมา ═══ */}
      <section className="card p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-bold text-ink flex items-center gap-2"><Icon name="file" size={18} /> มีใบของผู้รับเหมาอยู่แล้ว?</h2>
            <p className="text-sm text-ink-3 mt-0.5">
              อัปโหลดไฟล์ Excel ที่ช่างทำมา — ระบบจัดเข้าฟอร์ม แก้คำผิด ตัดชีท/แถวขยะให้
              <b> ราคาใช้ตามไฟล์เดิมทั้งหมด</b>
            </p>
          </div>
          <ImportQuoteButton onImport={applyImport} />
        </div>
      </section>

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

      {/* ═══ 3. ใบเสนอ — แก้ตรงบนกระดาษได้เลย ═══ */}
      <section className="card p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <h2 className="font-bold text-ink flex items-center gap-2">
            <Icon name="clipboard" size={18} /> ใบเสนอราคา
            <span className="text-xs font-normal text-ink-3">
              {items.length} รายการ · คลิกที่ช่องไหนก็แก้ได้เลย — หน้านี้คือหน้าที่จะพิมพ์ออกมา
            </span>
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

        {/* กระดาษ A4 จริง — ย่อให้พอดีจอเล็ก แต่สัดส่วนเท่าของจริง */}
        <div className="overflow-x-auto bg-gray-100 rounded-xl p-3 -mx-1">
          <div className="origin-top-left" style={{ minWidth: "210mm" }}>
            <FloorQuoteSheet
              editable
              customer={{ name: cName, address: cAddr, phone: cPhone }}
              issueDate={issueDate}
              revLabel={initial?.rev > 0 ? ` (Rev${String(initial.rev).padStart(2, "0")})` : ""}
              contractor={initial?.contractor ?? DEFAULT_CONTRACTOR}
              note={note}
              items={items}
              onItems={setItems}
              onCustomer={(p) => { if (p.name !== undefined) setCName(p.name); if (p.address !== undefined) setCAddr(p.address); }}
              onNote={setNote}
            />
          </div>
        </div>
        <datalist id="floor-remarks"><option value="งานเพิ่ม" /></datalist>
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
                พิมพ์ใบเสนอ / PDF
              </Link>
              <a href={`/api/floor-quotations/${initial.id}/xlsx`}
                className="press rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium">
                ดาวน์โหลด Excel
              </a>
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
