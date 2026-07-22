"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { baht } from "@/lib/money";
import { Spinner, EmptyState } from "@/components/ui/primitives";

/**
 * สรุป BOQ รายวัน — วันนี้ (เลือกวันได้) มีงานลูกค้าไหนตัด/เบิกวัสดุอะไรไปบ้าง (อลูรหัส + เส้น + กก.)
 * ข้อมูลจาก stock_moves (ตัดออกจริง) ผ่าน /api/boq-daily · งานเบิกไม่ผูกลูกค้าแยกกลุ่มท้าย
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
    <div className="max-w-[1100px] mx-auto p-4 sm:p-6 fade-in">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h1 className="text-2xl font-bold text-brand-dark mr-auto">📋 สรุป BOQ รายวัน</h1>
        <button onClick={() => setDate(todayISO())} className="press glass-soft rounded-lg px-3 py-2 text-sm text-ink-2 hover:bg-white/70">วันนี้</button>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value || todayISO())}
          className="glass rounded-lg px-3 py-2 text-sm outline-none tabular-nums" aria-label="เลือกวันที่" />
      </div>

      {/* สรุปรวมทั้งวัน */}
      {d && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            { label: "เส้น/ชิ้นที่ตัด", value: `${nbar(d.totals.bars)}`, sub: "รวมทุกงาน" },
            { label: "อลูมิเนียม (โดยประมาณ)", value: `${nkg(d.totals.kg)} กก.`, sub: "เฉพาะที่คิดตามน้ำหนัก" },
            { label: "มูลค่าวัสดุ", value: `฿${baht(d.totals.price)}`, sub: "ตามต้นทุนที่บันทึก" },
          ].map((k) => (
            <div key={k.label} className="glass-card rounded-2xl p-4">
              <div className="text-xs text-ink-3">{k.label}</div>
              <div className="text-xl font-bold text-brand-dark tabular-nums mt-0.5">{k.value}</div>
              <div className="text-[11px] text-ink-3 mt-0.5">{k.sub}</div>
            </div>
          ))}
        </div>
      )}

      {isLoading ? <Spinner />
        : error ? <EmptyState title="โหลดไม่สำเร็จ" subtitle={error instanceof Error ? error.message : ""} />
          : !d || d.groups.length === 0 ? <EmptyState title="วันนี้ยังไม่มีการตัด/เบิกวัสดุ" subtitle="ลองเลือกวันอื่น หรือรอทีมผลิตกดตัดสต็อกจากใบตัด" />
            : (
              <div className="space-y-4">
                {[...jobGroups, ...blankGroups].map((g) => (
                  <div key={g.key} className="glass-card rounded-2xl p-4">
                    <div className="flex items-baseline gap-2 flex-wrap mb-2">
                      <span className="font-bold text-brand-dark text-[15px]">{g.title}</span>
                      {g.kind === "job"
                        ? g.ref && <span className="text-[11px] tnum rounded-md px-1.5 py-0.5 font-semibold" style={{ background: "#eaf3ff", color: "#0a63c9" }}>{g.ref}</span>
                        : <span className="text-[11px] rounded-md px-1.5 py-0.5 font-semibold" style={{ background: "#fff3e0", color: "#c47b16" }}>งานเบิก (ไม่ผูกลูกค้า){g.ref ? ` · ${g.ref}` : ""}</span>}
                      <span className="ml-auto text-[12px] text-ink-3 tabular-nums">฿{baht(g.price)}</span>
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
                            <tr key={i} className="border-b border-black/5 last:border-0">
                              <td className="py-1.5 pr-2 tnum text-ink-2">{m.sku || "—"}</td>
                              <td className="py-1.5 pr-2 text-ink-2">{m.name}</td>
                              <td className="py-1.5 pr-2 text-right tabular-nums">{nbar(m.qty)} {m.unit}</td>
                              <td className="py-1.5 pr-2 text-right tabular-nums text-ink-3">{nkg(m.kg)}</td>
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
