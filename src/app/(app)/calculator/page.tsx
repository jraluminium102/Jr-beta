"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";

export default function CalculatorPage() {
  const router = useRouter();

  useEffect(() => {
    function handler(event: MessageEvent) {
      if (event.data?.type === "JR_QUOTE_ITEMS") {
        try {
          sessionStorage.setItem("jr_quote_items", JSON.stringify(event.data));
        } catch {
          /* ignore */
        }
        router.push("/quotations/new?from=calc");
      }
    }
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [router]);

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
          href="/calculator/index.html" target="_blank" rel="noopener noreferrer"
          className="press inline-flex items-center gap-1.5 glass-soft rounded-xl px-4 py-2 text-sm font-semibold text-brand-dark"
        >
          <Icon name="external" size={15} /> เปิดเต็มจอ (แท็บใหม่)
        </a>
      </div>

      <div className="glass rounded-2xl overflow-hidden">
        <iframe
          src="/calculator/index.html"
          title="เครื่องคิดราคา R3.9"
          className="w-full block"
          style={{ height: "calc(100vh - 160px)", minHeight: "600px", border: "none" }}
        />
      </div>
    </div>
  );
}
