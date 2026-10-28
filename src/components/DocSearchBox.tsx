import Link from "next/link";
import Icon from "@/components/Icon";

/**
 * ช่องค้นหาหน้ารายการเอกสาร (ใบเสนอราคา / ใบวางบิล / ใบเสร็จ) — เจ้าของ 28 ต.ค.69 "เพิ่มช่องค้นหา"
 *   ฟอร์ม GET ธรรมดา (?q=) → หน้า server กรองที่ฐานข้อมูลเอง · ไม่ต้องใช้ JS · คงค่า includeTest ไว้
 *   ค้นได้: เลขที่เอกสาร · ชื่อลูกค้า · ชื่องาน · ยอดเงิน (พิมพ์ตัวเลขตรง ๆ)
 */
export function DocSearchBox({ q, includeTest, basePath, placeholder }: { q: string; includeTest: boolean; basePath: string; placeholder?: string }) {
  return (
    <form action={basePath} method="get" className="flex items-center gap-2 flex-wrap">
      {includeTest && <input type="hidden" name="includeTest" value="1" />}
      <label className="relative flex-1 min-w-[220px]">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none"><Icon name="search" size={16} /></span>
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder={placeholder ?? "ค้นหา เลขที่ · ชื่อลูกค้า · ชื่องาน · ยอดเงิน"}
          className="w-full glass-soft rounded-xl pl-9 pr-3 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-brand/40"
          aria-label="ค้นหาเอกสาร"
        />
      </label>
      <button type="submit" className="press rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-brand shadow-brand">ค้นหา</button>
      {q && (
        <Link href={includeTest ? `${basePath}?includeTest=1` : basePath} className="text-sm text-ink-3 underline underline-offset-2">ล้างคำค้น</Link>
      )}
    </form>
  );
}

/**
 * เงื่อนไขค้นหาแบบ PostgREST `.or()` — เลขที่ / ชื่อลูกค้า / ชื่องาน (+ ยอดเงินถ้าพิมพ์เป็นตัวเลข)
 *   ตัดอักขระที่ทำให้ไวยากรณ์ .or() พัง (, ( ) * %) ออกก่อน · คืน "" = ไม่ต้องกรอง
 */
export function docSearchFilter(raw: string, amountCol: string): string {
  const q = String(raw ?? "").replace(/[,()*%\\]/g, " ").trim();
  if (!q) return "";
  const like = `%${q}%`;
  const parts = [`code.ilike.${like}`, `customer_snapshot->>name.ilike.${like}`, `customer_snapshot->>job.ilike.${like}`];
  const n = Number(q.replace(/[฿\s]/g, ""));
  if (/^[\d.,฿\s]+$/.test(raw.trim()) && Number.isFinite(n) && n > 0) parts.push(`${amountCol}.eq.${n}`);
  return parts.join(",");
}
