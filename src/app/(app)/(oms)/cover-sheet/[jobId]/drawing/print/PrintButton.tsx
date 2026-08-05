"use client";
import { Printer } from "lucide-react";

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="press inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-brand shadow-brand min-h-[44px]"
    >
      <Printer size={16} /> พิมพ์ / บันทึก PDF
    </button>
  );
}
