"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import type { Customer } from "@/lib/types";

type CustomerOption = Pick<Customer, "id" | "name" | "job" | "phone" | "address" | "contact_person">;

// หน้าคิดราคา — เลือกลูกค้าจากทะเบียน (combobox ค้นหาได้) + autofill iframe
// เมื่อกด "ออกใบเสนอราคา" ใน iframe → แนบ customer_id แล้วพาไปสร้างใบเสนอ
// ⚠️ ไม่แตะสูตรคิดราคาใน iframe (public/calculator/index.html)
export default function CalculatorClient({
  customers,
}: {
  customers: CustomerOption[];
}) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState<number | "">("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const comboRef = useRef<HTMLDivElement>(null);

  // Filter customers by query (name or last-4-digits of phone or address keyword)
  const filtered = query.trim()
    ? customers.filter((c) => {
        const q = query.trim().toLowerCase();
        const last4 = (c.phone ?? "").replace(/\D/g, "").slice(-4);
        return (
          c.name.toLowerCase().includes(q) ||
          (c.phone ?? "").toLowerCase().includes(q) ||
          last4.includes(q) ||
          (c.address ?? "").toLowerCase().includes(q)
        );
      })
    : customers;

  // Close dropdown on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (comboRef.current && !comboRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // Pick a customer: update state, close dropdown, autofill iframe
  function pickCustomer(c: CustomerOption) {
    setCustomerId(c.id);
    // Display label: "ชื่อ · เบอร์4ท้าย/งาน"
    const tail4 = (c.phone ?? "").replace(/\D/g, "").slice(-4);
    const label = tail4
      ? `${c.name} · ${tail4} / ${c.job || "—"}`
      : `${c.name} · ${c.job || "—"}`;
    setQuery(label);
    setOpen(false);

    // Autofill customer fields inside the iframe
    const iframe = iframeRef.current;
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage(
        {
          type: "JR_FILL_CUSTOMER",
          name: c.job ? `${c.name} / ${c.job}` : c.name,
          address: c.address ?? "",
          phone: c.phone ?? "",
          contact: c.contact_person ?? "",
        },
        window.location.origin, // iframe เป็น same-origin (/calculator) — ระบุ origin ตรง กัน postMessage รั่ว
      );
    }
  }

  function clearSelection() {
    setCustomerId("");
    setQuery("");
    setOpen(false);
  }

  // Listen for JR_QUOTE_ITEMS from iframe
  useEffect(() => {
    function handler(event: MessageEvent) {
      if (event.data?.type === "JR_QUOTE_ITEMS") {
        // Warn if no customer linked (can still proceed)
        if (!customerId) {
          const go = window.confirm(
            'ยังไม่ได้เลือกลูกค้าจากทะเบียน (ช่อง ① ด้านบน)\n\nกด "ตกลง" เพื่อไปต่อโดยให้เลือก/ยืนยันลูกค้าในหน้าใบเสนอ\nหรือ "ยกเลิก" เพื่อกลับมาเลือกลูกค้าก่อน',
          );
          if (!go) return;
        }
        try {
          const picked = customers.find((c) => c.id === customerId);
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

  // Format display label for the selected customer (used in aria-label)
  const selectedCustomer = customers.find((c) => c.id === customerId);

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

      {/* Customer registry selector — combobox with search (ยุบเป็น dropdown · กดหัวข้อเปิด) */}
      <details className="glass rounded-2xl p-4 marker:hidden [&::-webkit-details-marker]:hidden">
        <summary className="cursor-pointer list-none select-none flex items-center justify-between gap-2 text-xs font-semibold text-brand-dark">
          <span>① ผูกลูกค้าจากทะเบียน + วิธีออกใบเสนอราคา</span>
          <span className="font-normal text-ink-3">กดเพื่อเปิด ▾</span>
        </summary>
        <div className="mt-3">
        <div className="max-w-xl" ref={comboRef}>

          {/* Combobox input row */}
          <div className="relative">
            <div className="flex items-center gap-1 glass-soft rounded-lg px-3 py-2.5 focus-within:outline focus-within:outline-2 focus-within:outline-brand focus-within:outline-offset-1">
              <Icon name="search" size={15} className="shrink-0 text-ink-3" />
              <input
                type="text"
                role="combobox"
                aria-expanded={open}
                aria-haspopup="listbox"
                aria-label="ค้นหาลูกค้า"
                autoComplete="off"
                placeholder="พิมพ์ชื่อ / เบอร์ 4 ตัวท้าย / พื้นที่…"
                value={query}
                onFocus={() => setOpen(true)}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setOpen(true);
                  // Clear linked customer if user edits the field
                  if (customerId) setCustomerId("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setOpen(false);
                }}
                className="flex-1 min-w-0 bg-transparent outline-none text-sm text-ink placeholder:text-ink-3"
              />
              {/* Clear button — shown when a customer is selected */}
              {customerId !== "" && (
                <button
                  type="button"
                  onClick={clearSelection}
                  aria-label="ล้างการเลือก"
                  className="shrink-0 flex items-center justify-center w-5 h-5 rounded-full hover:bg-black/10"
                >
                  <Icon name="close" size={12} className="text-ink-2" />
                </button>
              )}
            </div>

            {/* Dropdown list */}
            {open && (
              <ul
                role="listbox"
                aria-label="รายชื่อลูกค้า"
                className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-xl border border-white/60 bg-white/95 shadow-lg backdrop-blur-md"
              >
                {filtered.length === 0 ? (
                  <li className="px-4 py-3 text-sm text-ink-3">
                    ไม่พบลูกค้าที่ตรงกัน
                  </li>
                ) : (
                  filtered.map((c) => {
                    const tail4 = (c.phone ?? "").replace(/\D/g, "").slice(-4);
                    const area = c.address
                      ? c.address.split(" ").slice(-2).join(" ")
                      : "";
                    return (
                      <li
                        key={c.id}
                        role="option"
                        aria-selected={c.id === customerId}
                        onMouseDown={(e) => {
                          // use mousedown to fire before onBlur closes
                          e.preventDefault();
                          pickCustomer(c);
                        }}
                        className={`px-4 py-2.5 cursor-pointer text-sm select-none
                          ${c.id === customerId
                            ? "bg-brand/10 font-semibold text-brand-dark"
                            : "text-ink hover:bg-black/5"
                          }`}
                      >
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="flex-1 min-w-0 truncate">
                            {c.name}
                            {c.job && (
                              <span className="ml-1 text-ink-3 font-normal">
                                · {c.job}
                              </span>
                            )}
                          </span>
                          <span className="shrink-0 tabular-nums text-xs text-ink-3">
                            {tail4 ? `…${tail4}` : "—"}
                            {area && ` / ${area}`}
                          </span>
                        </div>
                        {c.address && (
                          <div className="text-[11px] text-ink-3 truncate mt-0.5">📍 {c.address}</div>
                        )}
                      </li>
                    );
                  })
                )}
              </ul>
            )}
          </div>

          {/* Feedback: linked customer */}
          {selectedCustomer && (
            <p className="mt-1.5 text-xs text-green-700 font-medium flex items-center gap-1">
              <Icon name="check" size={13} />
              ผูกแล้ว: {selectedCustomer.name}
              {selectedCustomer.phone && (
                <span className="font-normal text-ink-3">· {selectedCustomer.phone}</span>
              )}
            </p>
          )}
          {customers.length === 0 && (
            <p className="text-xs text-amber-700 mt-1">
              ยังไม่มีลูกค้าในทะเบียน — เพิ่มที่เมนู "ทะเบียนลูกค้า" ก่อน
            </p>
          )}
        </div>

        <p className="text-[11px] text-ink-3 mt-3">
          ② คิดราคาด้านล่าง แล้วกดปุ่มแดง{" "}
          <strong>"ส่งเข้าระบบ JR → ออกใบเสนอราคา"</strong> ในเครื่องคิดราคา
          → ระบบจะพาไปสร้างใบเสนอพร้อมลูกค้า + รายการ + ราคาให้อัตโนมัติ
        </p>
        <p className="text-[11px] text-amber-700 mt-1">
          หมายเหตุ: <strong>ผูกลูกค้าเข้าระบบใช้ช่อง ① ด้านบนนี้</strong>{" "}
          — เมื่อเลือกแล้ว ช่องข้อมูลลูกค้าในเครื่องคิดราคาด้านล่างจะถูกเติมให้อัตโนมัติ
        </p>
        </div>
      </details>

      <div className="glass rounded-2xl overflow-hidden">
        <iframe
          ref={iframeRef}
          src="/calculator/index.html"
          title="เครื่องคิดราคา R3.9"
          className="w-full block"
          style={{ height: "calc(100vh - 260px)", minHeight: "560px", border: "none" }}
        />
      </div>
    </div>
  );
}
