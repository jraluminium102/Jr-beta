"use client";
import Icon from "@/components/Icon";

// เลือกพิมพ์ ต้นฉบับ / สำเนา / ทั้ง 2 — คุมผ่าน data-print-mode บน <html> + print CSS ในหน้า
//   ต้นฉบับ (default) = ซ่อนสำเนา · สำเนา = ซ่อนต้นฉบับ · ทั้ง 2 = โชว์คู่ (สำเนาขึ้นหน้าใหม่)
// เหมือนใบเสร็จ (ReceiptPrintControls)
function printAs(mode: "orig" | "copy" | "both") {
  document.documentElement.setAttribute("data-print-mode", mode);
  window.print();
  // คืนค่าเป็นต้นฉบับหลังพิมพ์ (กัน Ctrl+P ครั้งถัดไปติดโหมดเดิม)
  setTimeout(() => document.documentElement.setAttribute("data-print-mode", "orig"), 400);
}

export default function BillingPrintControls() {
  return (
    <div className="inline-flex items-center gap-1.5">
      <span className="text-xs text-ink-3 mr-0.5 hidden sm:inline">พิมพ์:</span>
      <button onClick={() => printAs("orig")} className="press inline-flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-white bg-brand shadow-brand">
        <Icon name="printer" size={15} /> ต้นฉบับ
      </button>
      <button onClick={() => printAs("copy")} className="press inline-flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-brand-dark glass-soft border border-brand/20">
        <Icon name="printer" size={15} /> สำเนา
      </button>
      <button onClick={() => printAs("both")} className="press inline-flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-brand-dark glass-soft border border-brand/20">
        ทั้ง 2
      </button>
    </div>
  );
}
