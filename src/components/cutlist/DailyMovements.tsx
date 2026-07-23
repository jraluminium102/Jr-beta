"use client";

/**
 * ความเคลื่อนไหวสโตร์รายวัน — เลือกวันได้
 *   ⬇️ เบิกออก/ตัดใช้งาน: จัดกลุ่มตามลูกค้า/งาน + ผู้เบิก (เบิกไปใช้งานใคร)
 *   ⬆️ รับเข้า/ซื้อเข้า: รายการรับเข้าวันนั้น (ต้นทุน/หน่วย · ผู้รับเข้า · หมายเหตุ)
 * ข้อมูลจาก stock_moves (เฉพาะที่หัก/รับจริง · ใบตัดที่เทสยังไม่ตัด = ไม่โผล่) ผ่าน /api/boq-daily
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/api";
import { baht } from "@/lib/money";
import { Card, Badge } from "@/components/ui";
import { Spinner, EmptyState } from "@/components/ui/primitives";

type Mat = { sku: string | null; name: string; unit: string; qty: number; kg: number; price: number };
type Group = { key: string; kind: "job" | "blank"; title: string; ref: string | null; price: number; bars: number; requesters: string[]; mats: Mat[] };
type Receive = { id: number; at: string; sku: string | null; name: string; category: string; unit: string; qty: number; unitCost: number; price: number; who: string; note: string };
type Data = { date: string; groups: Group[]; totals: { bars: number; kg: number; price: number }; receives: Receive[]; receiveTotal: number };

const todayISO = () => new Date().toISOString().slice(0, 10);
const nkg = (n: number) => (n ? n.toLocaleString("th-TH", { maximumFractionDigits: 1 }) : "—");
const nbar = (n: number) => (n ? n.toLocaleString("th-TH", { maximumFractionDigits: 2 }) : "—");
const nqty = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 2 });
// เลื่อนวัน (คุมด้วย string YYYY-MM-DD ตรง ๆ ไม่ให้ timezone เพี้ยน)
const shiftDay = (iso: string, d: number) => {
  const [y, m, day] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, day + d));
  return dt.toISOString().slice(0, 10);
};
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });

export default function DailyMovements() {
  const [date, setDate] = useState(todayISO());
  const { data, isLoading, error } = useQuery({
    queryKey: ["boq-daily", date],
    queryFn: () => api.get<Data>(`/boq-daily?date=${date}`),
  });
  const d = data?.data;
  const isToday = date === todayISO();

  return (
    <div className="space-y-5">
      {/* แถบเลือกวัน */}
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold text-brand-dark mr-auto flex items-center gap-2">📅 ความเคลื่อนไหวรายวัน</h2>
        <button onClick={() => setDate(shiftDay(date, -1))}
          className="press rounded-lg px-2.5 py-2 text-sm glass-soft text-ink-2" aria-label="วันก่อนหน้า">‹</button>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value || todayISO())}
          className="rounded-lg px-3 py-2 text-sm glass-soft text-ink-1 outline-none tabular-nums" aria-label="เลือกวันที่" />
        <button onClick={() => setDate(shiftDay(date, 1))} disabled={isToday}
          className="press rounded-lg px-2.5 py-2 text-sm glass-soft text-ink-2 disabled:opacity-40" aria-label="วันถัดไป">›</button>
        {!isToday && (
          <button onClick={() => setDate(todayISO())}
            className="press rounded-lg px-3 py-2 text-sm font-semibold bg-brand text-white shadow-brand">วันนี้</button>
        )}
      </div>

      {/* สรุปรวมทั้งวัน */}
      {d && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "เบิกใช้ (เส้น/ชิ้น)", value: nbar(d.totals.bars), sub: "รวมทุกงาน", tone: "text-red-700" },
            { label: "มูลค่าเบิกใช้", value: `฿${baht(d.totals.price)}`, sub: "ตามต้นทุนที่บันทึก", tone: "text-red-700" },
            { label: "รับเข้า/ซื้อเข้า", value: `฿${baht(d.receiveTotal)}`, sub: `${d.receives.length} รายการ`, tone: "text-emerald-700" },
            { label: "อลูมิเนียม (ประมาณ)", value: `${nkg(d.totals.kg)} กก.`, sub: "เฉพาะที่คิดตามน้ำหนัก", tone: "text-ink-1" },
          ].map((k) => (
            <Card key={k.label} className="p-3.5">
              <div className="text-xs text-ink-3">{k.label}</div>
              <div className={`text-xl font-bold tabular-nums mt-0.5 ${k.tone}`}>{k.value}</div>
              <div className="text-[11px] text-ink-3/70 mt-0.5">{k.sub}</div>
            </Card>
          ))}
        </div>
      )}

      {isLoading ? <Spinner />
        : error ? <EmptyState title="โหลดไม่สำเร็จ" sub={error instanceof Error ? error.message : ""} />
          : !d ? null
            : (
              <div className="space-y-6">
                {/* ⬇️ เบิกออก / ตัดใช้งาน */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-red-700">⬇️ เบิกออก / ตัดใช้งาน</span>
                    <span className="text-xs text-ink-3">({d.groups.length} งาน)</span>
                  </div>
                  {d.groups.length === 0
                    ? <EmptyState title="วันนี้ยังไม่มีการเบิก/ตัดวัสดุ" sub="ใบตัดที่ยังไม่กด “ตัดออกสโตร์” จะไม่นับ" />
                    : d.groups.map((g) => (
                      <Card key={g.key} className="p-4">
                        <div className="flex items-baseline gap-2 flex-wrap mb-2.5">
                          <span className="font-bold text-ink-1 text-[15px]">{g.title}</span>
                          {g.kind === "job"
                            ? g.ref && <span className="font-mono text-[11px]"><Badge tone="sky">{g.ref}</Badge></span>
                            : <Badge tone="amber">งานเบิก (ไม่ผูกลูกค้า){g.ref ? ` · ${g.ref}` : ""}</Badge>}
                          {g.requesters.length > 0 && (
                            <span className="text-[12px] text-ink-3">ผู้เบิก: <b className="text-ink-2">{g.requesters.join(", ")}</b></span>
                          )}
                          <span className="ml-auto text-[13px] font-semibold text-ink-2 tabular-nums">฿{baht(g.price)}</span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-ink-3 text-xs border-b border-black/5">
                                <th className="py-1.5 pr-2 font-medium">รหัส</th>
                                <th className="py-1.5 pr-2 font-medium">วัสดุ</th>
                                <th className="py-1.5 pr-2 font-medium text-right">จำนวน</th>
                                <th className="py-1.5 pr-2 font-medium text-right">กก.</th>
                              </tr>
                            </thead>
                            <tbody>
                              {g.mats.map((m, i) => (
                                <tr key={i} className="border-b border-black/[0.04] last:border-0">
                                  <td className="py-1.5 pr-2 font-mono text-ink-2">{m.sku || "—"}</td>
                                  <td className="py-1.5 pr-2 text-ink-1">{m.name}</td>
                                  <td className="py-1.5 pr-2 text-right tabular-nums text-ink-1">{nbar(m.qty)} {m.unit}</td>
                                  <td className="py-1.5 pr-2 text-right tabular-nums text-ink-3">{nkg(m.kg)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </Card>
                    ))}
                </div>

                {/* ⬆️ รับเข้า / ซื้อเข้า */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-emerald-700">⬆️ รับเข้า / ซื้อเข้า</span>
                    <span className="text-xs text-ink-3">({d.receives.length} รายการ)</span>
                    <Link href="/stock/moves" className="ml-auto text-xs text-brand-dark hover:underline">ดูสมุดรายเดือน →</Link>
                  </div>
                  {d.receives.length === 0
                    ? <EmptyState title="วันนี้ยังไม่มีการรับเข้า/ซื้อเข้า" sub="รับเข้าของได้ที่หน้าเช็คสต๊อก" />
                    : (
                      <Card className="p-0 overflow-hidden">
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-ink-3 text-xs border-b border-black/5 bg-black/[0.02]">
                                <th className="px-3 py-2 font-medium">เวลา</th>
                                <th className="px-3 py-2 font-medium">รหัส</th>
                                <th className="px-3 py-2 font-medium">วัสดุ</th>
                                <th className="px-3 py-2 font-medium text-right">จำนวน</th>
                                <th className="px-3 py-2 font-medium text-right">ต้นทุน/หน่วย</th>
                                <th className="px-3 py-2 font-medium text-right">รวม</th>
                                <th className="px-3 py-2 font-medium">ผู้รับเข้า</th>
                                <th className="px-3 py-2 font-medium">หมายเหตุ</th>
                              </tr>
                            </thead>
                            <tbody>
                              {d.receives.map((r) => (
                                <tr key={r.id} className="border-b border-black/[0.04] last:border-0 hover:bg-white/60">
                                  <td className="px-3 py-2 text-ink-3 tabular-nums whitespace-nowrap">{timeOf(r.at)}</td>
                                  <td className="px-3 py-2 font-mono text-ink-2">{r.sku || "—"}</td>
                                  <td className="px-3 py-2 text-ink-1">{r.name}</td>
                                  <td className="px-3 py-2 text-right tabular-nums text-emerald-700 font-semibold">+{nqty(r.qty)} {r.unit}</td>
                                  <td className="px-3 py-2 text-right tabular-nums text-ink-3">{r.unitCost ? baht(r.unitCost) : "—"}</td>
                                  <td className="px-3 py-2 text-right tabular-nums text-ink-1">{r.price ? `฿${baht(r.price)}` : "—"}</td>
                                  <td className="px-3 py-2 text-ink-2">{r.who || "—"}</td>
                                  <td className="px-3 py-2 text-ink-3 text-xs">{r.note || ""}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="font-semibold bg-black/[0.02]">
                                <td className="px-3 py-2 text-right text-ink-2" colSpan={5}>รวมมูลค่ารับเข้าวันนี้</td>
                                <td className="px-3 py-2 text-right tabular-nums text-emerald-700">฿{baht(d.receiveTotal)}</td>
                                <td colSpan={2}></td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </Card>
                    )}
                </div>
              </div>
            )}
    </div>
  );
}
