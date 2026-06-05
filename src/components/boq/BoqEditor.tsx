"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, Badge } from "@/components/ui";
import Icon from "@/components/Icon";

export type BoqHeader = {
  id: number;
  code: string;
  status: string;
  note: string;
  customer_snapshot: { name?: string; job?: string } | null;
  job_code?: string | null;
};

export type BoqItem = {
  id?: number;
  category: string;
  name: string;
  spec: string;
  qty: number;
  unit: string;
  stock_item_id?: number | null;
  sort_order?: number;
};

// หมวดวัสดุมาตรฐาน — จัดกลุ่มตาราง (reuse category string เดิม)
const CATEGORIES = [
  { key: "เส้นอลู", unit: "เส้น" },
  { key: "กระจก", unit: "แผ่น" },
  { key: "อุปกรณ์", unit: "ชุด" },
];

const STATUS_LABEL: Record<string, string> = {
  draft: "ร่าง", confirmed: "ยืนยันแล้ว", ordered: "สั่งซื้อแล้ว",
};
const STATUS_TONE: Record<string, "gray" | "amber" | "emerald"> = {
  draft: "gray", confirmed: "amber", ordered: "emerald",
};

// แมพหมวดของแถวให้ลงกลุ่มที่รู้จัก (ค่าว่าง/ไม่ตรง → กลุ่มแรก)
function bucketOf(category: string): string {
  const hit = CATEGORIES.find((c) => c.key === category);
  return hit ? hit.key : CATEGORIES[0].key;
}

export default function BoqEditor({
  header, initialItems, writable,
}: { header: BoqHeader; initialItems: BoqItem[]; writable: boolean }) {
  const router = useRouter();
  const [items, setItems] = useState<BoqItem[]>(
    (initialItems ?? []).map((it) => ({ ...it, category: it.category || CATEGORIES[0].key }))
  );
  const [status, setStatus] = useState(header.status);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  // จัดกลุ่มตาม category สำหรับแสดงผล
  const grouped = useMemo(() => {
    return CATEGORIES.map((cat) => ({
      ...cat,
      rows: items
        .map((it, idx) => ({ it, idx }))
        .filter(({ it }) => bucketOf(it.category) === cat.key),
    }));
  }, [items]);

  function update(idx: number, patch: Partial<BoqItem>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function remove(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }
  function addRow(category: string, unit: string) {
    setItems((prev) => [...prev, { category, name: "", spec: "", qty: 0, unit }]);
  }

  async function save() {
    setErr(""); setMsg("");
    setBusy(true);
    const res = await fetch(`/api/boq/${header.id}/items`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(json.error ?? "บันทึกไม่สำเร็จ"); return; }
    setMsg("บันทึกแล้ว");
    router.refresh();
  }

  async function changeStatus(next: string) {
    setErr(""); setMsg("");
    const res = await fetch(`/api/boq/${header.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    const json = await res.json();
    if (!res.ok) { setErr(json.error ?? "เปลี่ยนสถานะไม่สำเร็จ"); return; }
    setStatus(next);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2 print:hidden">
        <div className="flex items-center gap-3">
          <Link href="/boq" aria-label="ย้อนกลับ" className="press glass-soft w-9 h-9 rounded-xl inline-flex items-center justify-center text-brand-dark focusable">
            <Icon name="arrowLeft" size={18} />
          </Link>
          <h1 className="text-xl font-bold text-brand-dark font-mono">{header.code}</h1>
          <Badge tone={STATUS_TONE[status] ?? "gray"} dot>{STATUS_LABEL[status] ?? status}</Badge>
        </div>
        <div className="flex gap-2 flex-wrap">
          {writable && (
            <>
              <button onClick={save} disabled={busy} className="press inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-brand shadow-brand disabled:opacity-60">
                <Icon name="check" size={16} /> {busy ? "กำลังบันทึก…" : "บันทึก"}
              </button>
              <select
                value={status}
                onChange={(e) => changeStatus(e.target.value)}
                className="glass-soft rounded-xl px-3 py-2.5 text-sm outline-none focusable"
              >
                <option value="draft">ร่าง</option>
                <option value="confirmed">ยืนยันแล้ว</option>
                <option value="ordered">สั่งซื้อแล้ว</option>
              </select>
            </>
          )}
          <button onClick={() => window.print()} className="press inline-flex items-center gap-1.5 glass-soft rounded-xl px-4 py-2.5 text-sm font-semibold text-brand-dark focusable">
            <Icon name="printer" size={16} /> พิมพ์
          </button>
        </div>
      </div>

      {(msg || err) && (
        <p role="alert" className={`text-sm rounded-lg px-3 py-2 print:hidden ${err ? "text-red-700 bg-red-50" : "text-emerald-700 bg-emerald-50"}`}>
          {err || msg}
        </p>
      )}

      <Card className="p-6">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs font-medium text-ink-3 mb-1">ลูกค้า</div>
            <div className="font-semibold">{header.customer_snapshot?.name ?? "—"}</div>
            <div className="text-ink-2 text-sm">{header.customer_snapshot?.job ?? ""}</div>
          </div>
          <div className="text-right text-xs text-ink-3">
            <div>รหัส BOQ: <b className="text-ink font-mono">{header.code}</b></div>
            {header.job_code && <div>งาน: <b className="text-ink font-mono">{header.job_code}</b></div>}
          </div>
        </div>

        <div className="mt-5 space-y-6">
          {grouped.map((g) => (
            <div key={g.key}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-bold text-brand-dark">{g.key}</h3>
                {writable && (
                  <button onClick={() => addRow(g.key, g.unit)} className="press inline-flex items-center gap-1 text-xs font-semibold text-brand focusable print:hidden">
                    <Icon name="plus" size={14} /> เพิ่มแถว
                  </button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left bg-brand-soft text-brand-dark">
                      <th className="p-2 rounded-l-lg w-2/5">รายการ</th>
                      <th>สเปก</th>
                      <th className="text-right w-20">จำนวน</th>
                      <th className="w-20">หน่วย</th>
                      {writable && <th className="rounded-r-lg w-10 print:hidden"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.length === 0 ? (
                      <tr>
                        <td colSpan={writable ? 5 : 4} className="p-3 text-center text-ink-3 text-xs">— ยังไม่มีรายการ —</td>
                      </tr>
                    ) : (
                      g.rows.map(({ it, idx }) => (
                        <tr key={idx} className="border-b border-gray-100">
                          <td className="p-1.5">
                            {writable ? (
                              <input value={it.name} onChange={(e) => update(idx, { name: e.target.value })} placeholder="ชื่อรายการ"
                                className="w-full glass-soft rounded-lg px-2 py-1.5 outline-none focusable" />
                            ) : (it.name || "—")}
                          </td>
                          <td className="p-1.5">
                            {writable ? (
                              <input value={it.spec} onChange={(e) => update(idx, { spec: e.target.value })} placeholder="สเปก/รายละเอียด"
                                className="w-full glass-soft rounded-lg px-2 py-1.5 outline-none focusable" />
                            ) : (it.spec || "—")}
                          </td>
                          <td className="p-1.5 text-right">
                            {writable ? (
                              <input type="number" value={it.qty} onChange={(e) => update(idx, { qty: Number(e.target.value) })}
                                className="w-full glass-soft rounded-lg px-2 py-1.5 text-right outline-none focusable" />
                            ) : it.qty}
                          </td>
                          <td className="p-1.5">
                            {writable ? (
                              <input value={it.unit} onChange={(e) => update(idx, { unit: e.target.value })}
                                className="w-full glass-soft rounded-lg px-2 py-1.5 outline-none focusable" />
                            ) : it.unit}
                          </td>
                          {writable && (
                            <td className="p-1.5 text-center print:hidden">
                              <button onClick={() => remove(idx)} aria-label="ลบแถว" className="press text-ink-3 hover:text-red-600 focusable">
                                <Icon name="trash" size={16} />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>

        {header.note && <div className="mt-5 text-xs text-ink-3"><b>หมายเหตุ:</b> {header.note}</div>}
      </Card>
    </div>
  );
}
