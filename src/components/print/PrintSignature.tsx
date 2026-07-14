import { COMPANY } from "@/app/(app)/quotations/[id]/print/quote-constants";

// บล็อกลายเซ็นกลาง — ฟอร์มเดียวทุกเอกสาร (ใบเสนอ/ใบวางบิล/ใบเสร็จ)
// ซ้าย = ในนามลูกค้า · ขวา = ในนามบริษัท · แต่ละฝั่งมี 2 ช่อง: บทบาท + วันที่
export function PrintSignature({
  customerName, customerRole, companyRole,
}: {
  customerName?: string;
  customerRole: string;  // ฝั่งลูกค้า เช่น ผู้สั่งซื้อสินค้า / ผู้รับวางบิล / ผู้จ่ายเงิน
  companyRole: string;   // ฝั่งบริษัท เช่น ผู้อนุมัติ / ผู้วางบิล / ผู้รับเงิน
}) {
  const halves = [
    { name: customerName || "ลูกค้า", role: customerRole },
    { name: COMPANY.name, role: companyRole },
  ];
  return (
    <div className="mt-12 flex gap-10 justify-between" style={{ fontSize: 13 }}>
      {halves.map((h, i) => (
        <div key={i} className="flex-1">
          <div className="font-semibold text-center mb-14">ในนาม {h.name}</div>
          <div className="flex gap-6">
            <div className="flex-1 text-center">
              <div style={{ borderTop: "1px solid #9ca3af", paddingTop: 4 }}>{h.role}</div>
            </div>
            <div className="flex-1 text-center">
              <div style={{ borderTop: "1px solid #9ca3af", paddingTop: 4 }}>วันที่</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
