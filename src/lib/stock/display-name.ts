/**
 * stockDisplayName — ชื่อวัสดุที่เอาไปโชว์ = ชื่อ + สี
 * ─────────────────────────────────────────────────────────────────────────────
 * เจ้าของสั่ง 20 ส.ค.69: "ใส่สีแล้วให้ตั้งชื่อให้หมด"
 *   สโตร์เก็บสีไว้ในช่อง color (แยกจากชื่อ · migration 0106) แต่แถบรายการโชว์แค่ชื่อ
 *   → รหัสที่ต่างกันแค่สี (Align กุญแจ อบขาว JR00377 / ดำ JR00374) ขึ้นชื่อซ้ำกันเป๊ะ
 *     คนเบิกแยกไม่ออก ต้องกดเข้าไปดูทีละตัว
 *
 * ที่เดียวที่ตัดสินใจเรื่องนี้ — ทุกหน้าที่โชว์ชื่อวัสดุต้องเรียกตัวนี้ ห้ามต่อสีเอง
 */
import { colorFromName } from "../cutlist/stock-match.ts";

export type NamedStockRow = { name?: string | null; sku?: string | null; color?: string | null };

export function stockDisplayName(c: NamedStockRow): string {
  const name = String(c?.name ?? "").trim();
  const color = String(c?.color ?? "").trim();
  if (!name) return "—";
  // ชื่อมีสีอยู่ในตัวแล้ว (เช่น "F7976-เฟรมบน-อบขาว") → ไม่ต่อซ้ำ
  if (!color || name.includes(color) || colorFromName(name, c?.sku ?? "")) return name;
  return `${name} (${color})`;
}
