"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import type { Customer } from "@/lib/types";

// หน้าคิดราคา — เลือกลูกค้าจากทะเบียน (ผูก customer_id) + คิดราคาใน iframe
// เมื่อกด "ออกใบเสนอราคา" ใน iframe → แนบ customer_id ที่เลือก แล้วพาไปสร้างใบเสนอ
// ⚠️ ไม่แตะสูตรคิดราคาใน iframe (public/calculator/index.html)
export default function CalculatorClient({
  customers,
}: {
  customers: Pick<Customer, "id" | "name" | "job">[];
}) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState<number | "">("");

  useEffect(() => {
    function handler(event: MessageEvent) {
      if (event.data?.type === "JR_QUOTE_ITEMS") {
        // เตือนถ้ายังไม่ผูกลูกค้าจากทะเบียน (กันออกใบเสนอลอย/ผูกผิดคน)
        if (!customerId) {
          const go = window.confirm(
            "ยังไม่ได้เลือกลูกค้าจากทะเบียน (ช่อง ① ด้านบน)\n\nกด “ตกลง” เพื่อไปต่อโดยให้เลือก/ยืนยันลูกค้าในหน้าใบเสนอ\nหรือ “ยกเลิก” เพื่อกลับมาเลือกลูกค้าก่อน",
          );
          if (!go) return;
        }
        try {
          const picked = customers.find((c) => c.id === customerId);
          // แนบ customer_id (จากทะเบียน) ไปกับรายการ+ราคาจากเครื่องคิดราคา
          const payload = {
            ...event.data,
            customer_id: customerId || null,
            customer: picked?.name || event.data.customer || "",
          };
          sessionStorage.setItem("jr_quote_items", JSON.stringify(payload));
        } catch {
          /* ignore */
        }
        router.push("/quotations/new?from=calc");
      }
    }
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [router, customerId, customers]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-brand-dark flex items-center gap-2.5">
          <span className="text-white rounded-xl w-9 h-9 inline-flex items-center justify-center bg-brand shadow-brand">
            <Icon name="calculator" size={18} />
          </span>
          เครื่องคิดราคา R3.9
        </h1>
        <a
          href="/calculator/index.html"
          target="_blank"
          rel="noopener noreferrer"
          title="โหมดเต็มจอจะไม่ผูกลูกค้าจากทะเบียนอัตโนมัติ — ถ้าจะออกใบเสนอ แนะนำคิดในหน้านี้"
          className="press inline-flex items-center gap-1.5 glass-soft rounded-xl px-4 py-2 text-sm font-semibold text-brand-dark"
        >
          <Icon name="external" size={15} /> เปิดเต็มจอ (ดูอย่างเดียว)
        </a>
      </div>

      {/* เลือกลูกค้าจากทะเบียน — จะผูกกับใบเสนอราคาอัตโนมัติ */}
      <div className="glass rounded-2xl p-4">
        <label className="block max-w-xl">
          <span className="text-xs font-semibold text-brand-dark">
            ① ลูกค้า (จากทะเบียน) — จะผูกกับใบเสนอราคาอัตโนมัติ
          </span>
          <select
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value ? Number(e.target.value) : "")}
            className="w-full glass-soft rounded-lg px-3 py-2.5 mt-1 outline-none"
          >
            <option value="">— เลือกลูกค้าจากทะเบียน —</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.job}
              </option>
            ))}
          </select>
        </label>
        {customers.length === 0 && (
          <p className="text-xs text-amber-700 mt-1">
            ยังไม่มีลูกค้าในทะเบียน — เพิ่มที่เมนู “ทะเบียนลูกค้า” ก่อน
          </p>
        )}
        <p className="text-[11px] text-ink-3 mt-2">
          ② คิดราคาด้านล่าง แล้วกดปุ่มแดง <strong>“ส่งเข้าระบบ JR → ออกใบเสนอราคา”</strong> ในเครื่องคิดราคา
          → ระบบจะพาไปสร้างใบเสนอพร้อมลูกค้า + รายการ + ราคาที่คิดไว้ให้อัตโนมัติ
        </p>
        <p className="text-[11px] text-amber-700 mt-1">
          หมายเหตุ: <strong>ผูกลูกค้าเข้าระบบใช้ดรอปดาวน์ ① ด้านบนนี้</strong> — ส่วนช่อง “ชื่อลูกค้า/งาน”
          ในเครื่องคิดราคาด้านล่าง ใช้สำหรับพิมพ์หัวกระดาษ PDF เท่านั้น
        </p>
      </div>

      <div className="glass rounded-2xl overflow-hidden">
        <iframe
          src="/calculator/index.html"
          title="เครื่องคิดราคา R3.9"
          className="w-full block"
          style={{ height: "calc(100vh - 260px)", minHeight: "560px", border: "none" }}
        />
      </div>
    </div>
  );
}
