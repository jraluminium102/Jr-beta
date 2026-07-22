"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { baht } from "@/lib/money";
import { Spinner, EmptyState } from "@/components/ui/primitives";

/**
 * สรุป BOQ รายวัน — วันนี้ (เลือกวันได้) มีงานลูกค้าไหนตัด/เบิกวัสดุอะไรไปบ้าง (อลูรหัส + เส้น + กก.)
 * ข้อมูลจาก stock_moves (ตัดออกจริง) ผ่าน /api/boq-daily · งานเบิกไม่ผูกลูกค้าแยกกลุ่มท้าย
 * ⚠ อยู่ในโซน (oms) = พื้นแดงเข้ม → ตัวอักษรต้องเป็น text-white เสมอ (เจ้าของเจอฟอนต์มองไม่เห็น 22 ก.ค.69)
 */
type Mat = { sku: string | null; name: string; unit: string; qty: number; kg: number; price: number };
type Group = { key: string; kind: "job" | "blank"; title: string; ref: string | null; price: number; bars: number; mats: Mat[] };
type Data = { date: string; groups: Group[]; totals: { bars: number; kg: number; price: number } };

const todayISO = () => new Date().toISOString().slice(0, 10);
const nkg = (n: number) => (n ? n.toLocaleString("th-TH", { maximumFractionDigits: 1 }) : "—");
const nbar = (n: number) => (n ? n.toLocaleString("th-TH", { maximumFractionDigits: 2 }) : "—");

export default function BoqDailyPage() {
  const [date, setDate] = useState(todayISO());
  const { data, isLoading, error } = useQuery({
    queryKey: ["boq-daily", date],
    queryFn: () => api.get<Data>(`/boq-daily?date=${date}`),
  });
  const d = data?.data;
  const jobGroups = (d?.groups ?? []).filter((g) => g.kind === "job");
  const blankGroups = (d?.groups ?? []).filter((g) => g.kind === "blank");

  return (
    <div className="max-w-[1100px] mx-auto p-1 sm:p-2 fade-in text-white">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h1 className="text-2xl font-bold mr-auto flex items-center gap-2">📋 สรุป BOQ รายวัน</h1>
        <button onClick={() => setDate(todayISO())}
          className="press rounded-lg px-3 py-2 text-sm border border-white/20 text-white/85 hover:bg-white/10">วันนี้</button>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value || todayISO())}
          className="rounded-lg px-3 py-2 text-sm bg-white/95 text-gray-900 outline-none tabular-nums [color-scheme:light]" aria-label="เลือกวันที่" />
      </div>

      {/* สรุปรวมทั้งวัน */}
      {d && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            { label: "เส้น/ชิ้นที่ตัด", value: nbar(d.totals.bars), sub: "รวมทุกงาน" },
            { label: "อลูมิเนียม (โดยประมาณ)", value: `${nkg(d.totals.kg)} กก.`, sub: "เฉพาะที่คิดตามน้ำหนัก" },
            { label: "มูลค่าวัสดุ", value: `฿${baht(d.totals.price)}`, sub: "ตามต้นทุนที่บันทึก" },
          ].map((k) => (
            <div key={k.label} className="glass-card rounded-2xl p-4">
              <div className="text-xs text-white/60">{k.label}</div>
              <div className="text-xl font-bold text-white tabular-nums mt-0.5">{k.value}</div>
              <div className="text-[11px] text-white/45 mt-0.5">{k.sub}</div>
            </div>
          ))}
        </div>
      )}

      {isLoading ? <Spinner />
        : error ? <EmptyState title="โหลดไม่สำเร็จ" sub={error instanceof Error ? error.message : ""} />
          : !d || d.groups.length === 0 ? <EmptyState title="วันนี้ยังไม่มีการตัด/เบิกวัสดุ" sub="ลองเลือกวันอื่น หรือรอทีมผลิตกดตัดสต็อกจากใบตัด" />
            : (
              <div className="space-y-4">
                {[...jobGroups, ...blankGroups].map((g) => (
                  <div key={g.key} className="glass-card rounded-2xl p-4">
                    <div className="flex items-baseline gap-2 flex-wrap mb-2">
                      <span className="font-bold text-white text-[15px]">{g.title}</span>
                      {g.kind === "job"
                        ? g.ref && <span className="text-[11px] tnum rounded-md px-1.5 py-0.5 font-semibold bg-sky-500/20 text-sky-100 border border-sky-300/30">{g.ref}</span>
                        : <span className="text-[11px] rounded-md px-1.5 py-0.5 font-semibold bg-amber-500/20 text-amber-100 border border-amber-300/40">งานเบิก (ไม่ผูกลูกค้า){g.ref ? ` · ${g.ref}` : ""}</span>}
                      <span className="ml-auto text-[12px] text-white/60 tabular-nums">฿{baht(g.price)}</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-white/50 text-xs border-b border-white/10">
                            <th className="py-1.5 pr-2 font-medium">รหัส</th>
                            <th className="py-1.5 pr-2 font-medium">วัสดุ</th>
                            <th className="py-1.5 pr-2 font-medium text-right">จำนวน</th>
                            <th className="py-1.5 pr-2 font-medium text-right">กก.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.mats.map((m, i) => (
                            <tr key={i} className="border-b border-white/10 last:border-0">
                              <td className="py-1.5 pr-2 tnum text-white/80">{m.sku || "—"}</td>
                              <td className="py-1.5 pr-2 text-white/90">{m.name}</td>
                              <td className="py-1.5 pr-2 text-right tabular-nums text-white">{nbar(m.qty)} {m.unit}</td>
                              <td className="py-1.5 pr-2 text-right tabular-nums text-white/60">{nkg(m.kg)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
    </div>
  );
}
