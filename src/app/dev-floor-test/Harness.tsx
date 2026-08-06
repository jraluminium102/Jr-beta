"use client";

import { useState } from "react";
import { FloorQuoteSheet } from "@/components/floor/FloorQuoteSheet";

/** ตัวคุม state ให้หน้าทดสอบ — ต้องเป็น client ถึงจะกด แก้/ลบ/เพิ่ม ได้จริง (dev เท่านั้น) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function Harness({ initial, editable }: { initial: any[]; editable: boolean }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [items, setItems] = useState<any[]>(initial);
  const [cust, setCust] = useState({ name: "คุณกาญจนา", address: "212/160 หมู่บ้านชัยพฤกษ์ จ.นครปฐม 73210" });

  return (
    <>
      {/* กล่องสถานะ — playwright อ่านค่าจากตรงนี้เพื่อตรวจว่า action เข้าจริงไหม */}
      <pre data-testid="state" className="text-xs bg-white border rounded p-2 mb-2 max-w-[210mm] mx-auto overflow-x-auto">
{JSON.stringify(items.map((it) => ({ g: it.group_label, n: it.name, q: it.qty, u: it.unit_price })), null, 0)}
      </pre>
      <FloorQuoteSheet
        editable={editable}
        customer={cust}
        issueDate="2026-08-06"
        contractor={{ name: "นายเพยาว์ สุขอุทัย", phone: "089-035-8526" }}
        items={items}
        onItems={setItems}
        onCustomer={(p) => setCust((c) => ({ ...c, ...p }))}
      />
    </>
  );
}
