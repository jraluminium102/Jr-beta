"use client";

import { useEffect } from "react";
import Icon from "@/components/Icon";
import { Badge } from "@/components/ui";
import { baht } from "@/lib/money";
import type { LinkStockRow } from "@/lib/calculator40/link-rows";

// แผงข้างดูข้อมูลสโตร์ (เจ้าของสั่งตรง ๆ: "จิ้มดูได้ว่ารหัสนี้คืออะไรในสโตร์") — เปิดทับหน้า ไม่นำทางออกไป
// ทรง: desktop = แผงขวาเต็มความสูง (ลอกโครง OpsSummaryDrawer.tsx) · มือถือ = bottom sheet
export default function StockDrawer({
  sku, rows, usedBy, canSeeCost, onClose, onPickProduct, onCreateInStock,
}: {
  sku: string;
  rows: LinkStockRow[];
  usedBy: { productId: string; productName: string }[];
  canSeeCost: boolean;
  onClose: () => void;
  onPickProduct: (id: string) => void;
  onCreateInStock?: () => void;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const data = rows[0] ?? null;
  const price = data ? (data.is_weight_based ? data.weight_per_unit * data.price_per_kg : data.unit_cost) : 0;
  const siblings = rows.slice(1);

  return (
    <div className="fixed inset-0 z-50 flex sm:justify-end items-end sm:items-stretch" role="dialog" aria-modal="true" aria-label={`ข้อมูลสโตร์ ${sku}`}>
      <div className="absolute inset-0 scrim fade-in" onClick={onClose} />

      <div className="relative w-full sm:max-w-md max-h-[85dvh] sm:max-h-none sm:h-[100dvh] glass rounded-t-3xl sm:rounded-t-none sm:rounded-l-3xl overflow-y-auto slide-in">
        {/* หัว */}
        <div className="sticky top-0 glass px-5 py-4 flex items-start justify-between gap-3 z-10">
          <div className="min-w-0">
            <div className="font-mono font-bold text-lg text-brand-dark break-all">{sku}</div>
            <div className="text-sm text-ink-2 truncate">{data?.name ?? "ไม่มีรหัสนี้ในสโตร์"}</div>
            {data?.color && (
              <span className="mt-1 inline-block"><Badge tone="gray">{data.color}</Badge></span>
            )}
          </div>
          <div className="flex gap-1 shrink-0">
            <a href={`/stock?q=${encodeURIComponent(sku)}`} target="_blank" rel="noopener" aria-label="เปิดหน้าสโตร์"
              className="press w-10 h-10 inline-flex items-center justify-center rounded-xl text-ink-3 hover:bg-brand-soft">
              <Icon name="external" size={17} />
            </a>
            <button onClick={onClose} aria-label="ปิด" className="press w-10 h-10 inline-flex items-center justify-center rounded-xl text-ink-3 hover:bg-brand-soft">
              <Icon name="close" size={18} />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {!data ? (
            <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">
              ⚠ ไม่มี <b className="font-mono">{sku}</b> ในสโตร์ — บรรทัดนี้กำลังผูกกับของที่ไม่มีตัวตน
              {onCreateInStock && (
                <button onClick={onCreateInStock}
                  className="press mt-3 w-full min-h-[44px] rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-brand shadow-brand">
                  ＋ สร้างในสโตร์ (กรอกเอง)
                </button>
              )}
            </div>
          ) : (
            <>
              {/* ตัวเลขที่ใช้ตัดสินใจ */}
              <div className="grid grid-cols-2 gap-2">
                {canSeeCost && (
                  <div className="glass-soft rounded-xl px-3 py-2">
                    <div className="text-[11px] text-ink-3">ราคา/หน่วย</div>
                    <div className="font-bold tabular-nums">฿{baht(price)}</div>
                  </div>
                )}
                <div className="glass-soft rounded-xl px-3 py-2">
                  <div className="text-[11px] text-ink-3">หน่วย</div>
                  <div className="font-bold">{data.is_weight_based ? "เส้น" : "—"}</div>
                </div>
                <div className={"glass-soft rounded-xl px-3 py-2 " + (data.qty_on_hand <= 0 ? "bg-red-50" : "")}>
                  <div className="text-[11px] text-ink-3">คงเหลือ</div>
                  <div className={"font-bold tabular-nums " + (data.qty_on_hand <= 0 ? "text-red-700" : "")}>
                    {data.qty_on_hand.toLocaleString("th-TH")}
                    {data.qty_on_hand <= 0 && <span className="ml-1 text-[11px] font-normal">ของหมด</span>}
                  </div>
                </div>
                {canSeeCost && (
                  <div className="glass-soft rounded-xl px-3 py-2">
                    <div className="text-[11px] text-ink-3">มูลค่าคงเหลือ</div>
                    <div className="font-bold tabular-nums">฿{baht(price * data.qty_on_hand)}</div>
                  </div>
                )}
              </div>

              {/* รายละเอียด + สมการราคาต่อโล */}
              <div className="glass-soft rounded-xl px-4 divide-y divide-black/5 text-sm">
                <div className="flex justify-between py-2"><span className="text-ink-3">หมวด</span><span>{data.category || "—"}</span></div>
                <div className="flex justify-between py-2"><span className="text-ink-3">ผู้ขาย</span><span>{data.supplier || "—"}</span></div>
                {data.is_weight_based && canSeeCost && (
                  <div className="py-2">
                    <span className="text-ink-3">คิดราคาต่อโล</span>
                    <div className="mt-1">
                      {data.weight_per_unit > 0
                        ? <>{data.weight_per_unit} กก. × ฿{baht(data.price_per_kg)} = <b>฿{baht(price)}</b>/เส้น</>
                        : (
                          <span className="text-red-700">
                            ไม่มีน้ำหนัก — ขึ้นเรตต่อโลแล้วราคาไม่ขยับ{" "}
                            <a href="/stock/weight-backfill" className="underline font-semibold">เติมน้ำหนัก</a>
                          </span>
                        )}
                    </div>
                  </div>
                )}
              </div>

              {/* หลายแถว/หลายสี */}
              {siblings.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-brand-dark mb-1.5">รหัสนี้มีหลายสีในสโตร์</div>
                  <table className="w-full text-xs">
                    <tbody>
                      {siblings.map((s) => (
                        <tr key={s.id} className="border-t border-line/60">
                          <td className="py-1.5">{s.color || "—"}</td>
                          {canSeeCost && <td className="py-1.5 text-right tabular-nums">฿{baht(s.is_weight_based ? s.weight_per_unit * s.price_per_kg : s.unit_cost)}</td>}
                          <td className="py-1.5 text-right tabular-nums text-ink-3">{s.qty_on_hand.toLocaleString("th-TH")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* ใช้ที่ไหนบ้าง */}
          <div>
            <div className="text-xs font-semibold text-brand-dark mb-1.5">ใช้ในคิดราคา 4.0 · {usedBy.length} รุ่น</div>
            <div className="flex flex-wrap gap-1.5">
              {usedBy.map((p) => (
                <button key={p.productId} onClick={() => { onPickProduct(p.productId); onClose(); }}
                  className="press text-xs rounded-lg px-2.5 py-1.5 glass-soft text-ink-2">
                  {p.productName}
                </button>
              ))}
              {!usedBy.length && <span className="text-xs text-ink-3">— ยังไม่มีรุ่นไหนเรียกใช้รหัสนี้ในผลตรวจตอนนี้</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
