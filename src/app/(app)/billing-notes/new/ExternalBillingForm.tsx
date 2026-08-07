"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import Icon from "@/components/Icon";
import DateField from "@/components/ui/DateField";
import { baht, computeTotals, suggestInstallments } from "@/lib/money";
import { todayISO } from "@/lib/date-guard";

// ใบวางบิล "ลูกค้านอกระบบ" — ยังไม่มีใบเสนอราคา/งานในระบบ
//   พิมพ์ชื่อลูกค้า + รายการเอง → ออกบิลได้เลย · ผูกใบเสนอทีหลังที่หน้ารายละเอียดบิล
//   ยอด/VAT/หัก ณ ที่จ่าย ใช้ computeTotals ตัวกลางตัวเดียวกับทั้งระบบ (ห้ามคิดเอง)

type Row = { key: number; name: string; qty: string; price: string };

const emptyRow = (key: number): Row => ({ key, name: "", qty: "1", price: "" });

export default function ExternalBillingForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [job, setJob] = useState("");
  const [address, setAddress] = useState("");
  const [taxId, setTaxId] = useState("");
  const [branch, setBranch] = useState("");
  const [contact, setContact] = useState("");
  const [phone, setPhone] = useState("");

  const [rows, setRows] = useState<Row[]>([emptyRow(1)]);
  const [seq, setSeq] = useState(2);
  const [discMode, setDiscMode] = useState<"pct" | "baht">("pct");
  const [disc, setDisc] = useState("");
  const [discAmt, setDiscAmt] = useState("");
  const [vat, setVat] = useState(7);
  const [wht, setWht] = useState(0);
  const [issueDate, setIssueDate] = useState(todayISO());
  const [note, setNote] = useState("");

  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [err, setErr] = useState("");

  const items = useMemo(
    () => rows
      .filter((r) => r.name.trim() && Number(r.price) >= 0 && Number(r.qty) > 0 && r.price !== "")
      .map((r) => ({ qty: Number(r.qty), unit_price: Number(r.price) })),
    [rows],
  );
  const discInput = discMode === "baht"
    ? { discount_pct: 0, discount_amt: Number(discAmt) || 0 }
    : { discount_pct: Number(disc) || 0 };
  const t = useMemo(
    () => computeTotals({ items: items.length ? items : [{ qty: 1, unit_price: 0 }], vat_rate: vat, wht_rate: wht, ...discInput }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, vat, wht, disc, discAmt, discMode],
  );
  const plan = useMemo(() => (t.net > 0 ? suggestInstallments(t.net, vat) : []), [t.net, vat]);

  const setRow = (key: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  async function submit() {
    if (busyRef.current) return;
    setErr("");
    if (!name.trim()) { setErr("ต้องระบุชื่อลูกค้า"); return; }
    if (!items.length) { setErr("ต้องมีรายการอย่างน้อย 1 บรรทัด (ใส่ชื่อ + ราคา)"); return; }
    if (t.net <= 0) { setErr("ยอดสุทธิต้องมากกว่า 0"); return; }

    busyRef.current = true; setBusy(true);
    try {
      const res = await fetch("/api/billing-notes/external", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: {
            name: name.trim(), job: job.trim(), address: address.trim(), tax_id: taxId.trim(),
            branch: branch.trim(), contact_person: contact.trim(), phone: phone.trim(),
          },
          items: rows
            .filter((r) => r.name.trim() && r.price !== "" && Number(r.qty) > 0)
            .map((r) => ({ name: r.name.trim(), qty: Number(r.qty), unit_price: Number(r.price) })),
          ...(discMode === "baht" ? { discount_amt: Number(discAmt) || 0 } : { discount_pct: Number(disc) || 0 }),
          vat_rate: vat, wht_rate: wht, issue_date: issueDate, note,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setErr(json.error ?? "สร้างไม่สำเร็จ"); return; }
      router.push(`/billing-notes/${json.data.id}`);
    } catch {
      setErr("เกิดข้อผิดพลาด กรุณาลองใหม่");
    } finally {
      busyRef.current = false; setBusy(false);
    }
  }

  const inp = "w-full glass-soft rounded-lg px-3 py-2.5 mt-1 outline-none";

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <Card className="p-5">
          <h3 className="font-bold text-brand-dark mb-3 flex items-center gap-2">
            <Icon name="user" size={16} /> ลูกค้า (พิมพ์เอง — ยังไม่มีในระบบ)
          </h3>
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <label className="block sm:col-span-2">
              <span className="text-xs font-medium text-ink-3">ชื่อลูกค้า / ชื่อออกบิล *</span>
              <input value={name} onChange={(e) => setName(e.target.value)} className={inp} placeholder="เช่น คุณสมชาย ใจดี / บจก. ..." />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-xs font-medium text-ink-3">ที่อยู่</span>
              <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} className={inp} />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-ink-3">ชื่องาน / สถานที่</span>
              <input value={job} onChange={(e) => setJob(e.target.value)} className={inp} />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-ink-3">เลขผู้เสียภาษี</span>
              <input value={taxId} onChange={(e) => setTaxId(e.target.value)} className={inp} inputMode="numeric" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-ink-3">สาขา</span>
              <input value={branch} onChange={(e) => setBranch(e.target.value)} className={inp} placeholder="สำนักงานใหญ่" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-ink-3">ผู้ติดต่อ</span>
              <input value={contact} onChange={(e) => setContact(e.target.value)} className={inp} />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-ink-3">โทร</span>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inp} inputMode="tel" />
            </label>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-brand-dark">รายการที่วางบิล</h3>
            <button
              type="button"
              onClick={() => { setRows((rs) => [...rs, emptyRow(seq)]); setSeq((s) => s + 1); }}
              className="press text-xs font-semibold text-brand-dark glass-soft rounded-lg px-3 py-1.5"
            >
              + เพิ่มบรรทัด
            </button>
          </div>
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={r.key} className="grid grid-cols-12 gap-2 items-start">
                <div className="col-span-6">
                  {i === 0 && <span className="text-[11px] text-ink-3">รายการ</span>}
                  <input value={r.name} onChange={(e) => setRow(r.key, { name: e.target.value })}
                    className="w-full glass-soft rounded-lg px-3 py-2 outline-none text-sm" placeholder="เช่น งานติดตั้งมุ้งลวด" />
                </div>
                <div className="col-span-2">
                  {i === 0 && <span className="text-[11px] text-ink-3">จำนวน</span>}
                  <input value={r.qty} onChange={(e) => setRow(r.key, { qty: e.target.value })}
                    className="w-full glass-soft rounded-lg px-3 py-2 outline-none text-sm text-right tabular-nums" inputMode="decimal" />
                </div>
                <div className="col-span-3">
                  {i === 0 && <span className="text-[11px] text-ink-3">ราคา/หน่วย</span>}
                  <input value={r.price} onChange={(e) => setRow(r.key, { price: e.target.value })}
                    className="w-full glass-soft rounded-lg px-3 py-2 outline-none text-sm text-right tabular-nums" inputMode="decimal" placeholder="0" />
                </div>
                <div className="col-span-1 flex justify-end">
                  {i === 0 && <span className="block text-[11px]">&nbsp;</span>}
                  {rows.length > 1 && (
                    <button type="button" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                      className="press text-ink-3 hover:text-red-600 px-2 py-2" aria-label="ลบบรรทัด">
                      <Icon name="trash-2" size={15} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="grid sm:grid-cols-2 gap-3 text-sm mt-4 pt-4 border-t border-black/5">
            <div>
              <span className="text-xs font-medium text-ink-3">ส่วนลด</span>
              <div className="flex gap-2 mt-1">
                <select value={discMode} onChange={(e) => setDiscMode(e.target.value as "pct" | "baht")}
                  className="glass-soft rounded-lg px-2 py-2.5 outline-none text-sm">
                  <option value="pct">%</option>
                  <option value="baht">บาท</option>
                </select>
                {discMode === "pct"
                  ? <input value={disc} onChange={(e) => setDisc(e.target.value)} className="flex-1 glass-soft rounded-lg px-3 py-2.5 outline-none text-right tabular-nums" inputMode="decimal" placeholder="0" />
                  : <input value={discAmt} onChange={(e) => setDiscAmt(e.target.value)} className="flex-1 glass-soft rounded-lg px-3 py-2.5 outline-none text-right tabular-nums" inputMode="decimal" placeholder="0" />}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-medium text-ink-3">VAT</span>
                <select value={vat} onChange={(e) => setVat(Number(e.target.value))} className={inp}>
                  <option value={7}>7%</option>
                  <option value={0}>ไม่มี VAT</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-ink-3">หัก ณ ที่จ่าย</span>
                <select value={wht} onChange={(e) => setWht(Number(e.target.value))} className={inp}>
                  <option value={0}>ไม่หัก</option>
                  <option value={3}>3%</option>
                </select>
              </label>
            </div>
            <label className="block">
              <span className="text-xs font-medium text-ink-3">วันที่ออกบิล</span>
              <DateField value={issueDate} onChange={setIssueDate} aria-label="วันที่ออกบิล" className={inp} />
              <span className="block text-[11px] text-ink-3 mt-1">เลขที่เอกสารออกตามเดือนของวันที่นี้</span>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-ink-3">หมายเหตุ</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} className={inp} />
            </label>
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="font-bold text-brand-dark mb-3">งวดชำระที่จะแบ่ง (อัตโนมัติ)</h3>
          {plan.length === 0 ? (
            <p className="text-sm text-ink-3">ใส่รายการและราคาเพื่อดูงวดชำระ</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left bg-brand-soft text-brand-dark">
                  <th className="p-2 rounded-l-lg">งวด</th><th>รายละเอียด</th>
                  <th className="text-right p-2 rounded-r-lg">ยอด</th>
                </tr>
              </thead>
              <tbody>
                {plan.map((p) => (
                  <tr key={p.seq} className="border-b border-gray-100">
                    <td className="p-2">{p.seq}</td>
                    <td className="whitespace-pre-line">{p.label}</td>
                    <td className="text-right tabular-nums p-2">฿{baht(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <div className="space-y-4">
        <Card className="p-5 sticky top-4">
          <h3 className="font-bold text-brand-dark mb-3">สรุปยอด</h3>
          <dl className="text-sm space-y-1.5">
            <div className="flex justify-between"><dt className="text-ink-3">ยอดก่อนภาษี</dt><dd className="tabular-nums">฿{baht(t.subtotal)}</dd></div>
            {t.discount_amt > 0 && <div className="flex justify-between"><dt className="text-ink-3">ส่วนลด</dt><dd className="tabular-nums text-red-600">-฿{baht(t.discount_amt)}</dd></div>}
            {vat > 0 && <div className="flex justify-between"><dt className="text-ink-3">VAT {vat}%</dt><dd className="tabular-nums">฿{baht(t.vat_amt)}</dd></div>}
            {wht > 0 && <div className="flex justify-between"><dt className="text-ink-3">หัก ณ ที่จ่าย {wht}%</dt><dd className="tabular-nums text-red-600">-฿{baht(t.wht_amt)}</dd></div>}
            <div className="flex justify-between pt-2 border-t border-black/10 font-bold text-brand-dark">
              <dt>ยอดสุทธิ</dt><dd className="tabular-nums text-lg">฿{baht(t.net)}</dd>
            </div>
          </dl>

          <div className="mt-4 text-[11px] text-sky-900 bg-sky-50 border border-sky-200 rounded-lg px-3 py-2">
            บิลนี้จะขึ้นป้าย <b>“นอกระบบ”</b> — เมื่อออกใบเสนอราคาให้ลูกค้ารายนี้แล้ว
            เข้าหน้ารายละเอียดบิลแล้วกด <b>“ผูกเข้าระบบ”</b> เพื่อผูกกับใบเสนอ/งาน
            (เงินที่รับไปแล้วจะถูกลงบัญชีย้อนหลังให้)
          </div>

          {err && <p className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
          <button
            onClick={submit}
            disabled={busy}
            className="press w-full mt-4 bg-brand text-white rounded-xl px-4 py-3 font-semibold shadow-brand disabled:opacity-50"
          >
            {busy ? "กำลังบันทึก…" : "สร้างใบวางบิล"}
          </button>
        </Card>
      </div>
    </div>
  );
}
