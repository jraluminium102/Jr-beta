import type { QuotationStatus } from "@/lib/types";

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`glass rounded-2xl ${className}`}>{children}</div>;
}

const TONES: Record<string, string> = {
  red: "bg-red-100 text-red-800",
  emerald: "bg-emerald-100 text-emerald-800",
  amber: "bg-amber-100 text-amber-900",
  sky: "bg-sky-100 text-sky-800",
  gray: "bg-gray-200 text-gray-700",
  violet: "bg-violet-100 text-violet-800",
};

export function Badge({
  children, tone = "red", dot,
}: { children: React.ReactNode; tone?: keyof typeof TONES; dot?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${TONES[tone]}`}>
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />}
      {children}
    </span>
  );
}

const STATUS_TONE: Record<QuotationStatus, keyof typeof TONES> = {
  draft: "gray",
  sent: "sky",
  approved: "emerald",
  cancelled: "red",
};
const STATUS_TEXT: Record<QuotationStatus, string> = {
  draft: "ร่าง", sent: "ส่งลูกค้า", approved: "อนุมัติ", cancelled: "ยกเลิก",
};

export function StatusBadge({ status }: { status: QuotationStatus }) {
  return <Badge tone={STATUS_TONE[status]} dot>{STATUS_TEXT[status]}</Badge>;
}
