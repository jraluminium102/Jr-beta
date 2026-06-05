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
          className="press inline-flex items-center gap-1.5 glass-soft rounded-xl px-4 py-2 text-sm font-semibold text-brand-dark"
        >
          <Icon name="external" size={15} /> เปิดเต็มจอ (แท็บใหม่)
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
          ② คิดราคาด้านล่าง แล้วกดปุ่ม “ออกใบเสนอราคา” ในเครื่องคิดราคา → ระบบจะพาไปสร้างใบเสนอ
          พร้อมลูกค้า + รายการ + ราคาที่คิดไว้ให้อัตโนมัติ
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
