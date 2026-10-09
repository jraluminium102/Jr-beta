import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";
import { fetchAllPaged } from "@/lib/supabase/fetch-all";
import { colorFromName } from "@/lib/cutlist/stock-match";

// POST /api/stock/colors  → เติมช่อง "สี" ของแถวอลูจากท้ายชื่อ (ที่สโตร์เขียนไว้อยู่แล้ว)
//   เจ้าของทัก 9 ต.ค.69 "หน้าเรตอลูยังเหมือนเดิม" — ต้นเหตุคือ 1,026 จาก 1,294 แถวอลู ช่องสีว่าง
//   หน้าเรตอลูจัดกลุ่มตามสี พอสีว่างเลยไปเดาจากท้ายชื่อ ได้กลุ่มเพี้ยน ("ตัวตบรางมุ้ง" กลายเป็นสี)
//   และ [[stock-match-no-guess]] ก็ใช้ stock_items.color เป็นตัวตัดสินตอนหักสต็อก
// ⚠ สีมาจากฟังก์ชันกลาง colorFromName() เท่านั้น — client ส่งค่าสีมาเองไม่ได้
//   body: { dryRun?: boolean }  (ค่าตั้งต้น = dry run · ต้องส่ง dryRun:false ถึงจะเขียนจริง)
const WRITE_ROLES = ["ADMIN", "ACCOUNTING"];
type Sb = { from: (t: string) => any };   // eslint-disable-line @typescript-eslint/no-explicit-any
type Row = { id: number; name: string | null; sku: string | null; color: string | null; category: string | null };

export async function POST(req: Request) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!WRITE_ROLES.includes(profile.role)) return FORBIDDEN();

  const body = await req.json().catch(() => null);
  const dryRun = body?.dryRun !== false;

  const sb = createClient() as unknown as Sb;
  const rows = await fetchAllPaged<Row>((f, t) =>
    sb.from("stock_items").select("id, name, sku, color, category")
      .eq("is_active", true).order("id", { ascending: true }).range(f, t));

  const todo: { id: number; color: string }[] = [];
  const byColor: Record<string, number> = {};
  for (const r of rows) {
    if (!/อลูมิเนียม/.test(String(r.category ?? ""))) continue;
    if (String(r.color ?? "").trim()) continue;              // มีสีแล้ว ไม่แตะ
    const c = colorFromName(r.name ?? "", r.sku ?? "");
    if (!c) continue;                                        // เดาไม่ออก = ไม่เดา
    todo.push({ id: r.id, color: c });
    byColor[c] = (byColor[c] ?? 0) + 1;
  }

  if (dryRun) return ok({ dryRun: true, would: todo.length, byColor, note: "ยังไม่เขียน — ส่ง dryRun:false ถึงจะบันทึกจริง" });

  // อัปเดตเป็นก้อนตามสี (สีเดียวกันยิงรวดเดียว)
  const byVal = new Map<string, number[]>();
  for (const t of todo) byVal.set(t.color, [...(byVal.get(t.color) ?? []), t.id]);
  let updated = 0;
  const errs: string[] = [];
  for (const [color, ids] of byVal) {
    for (let i = 0; i < ids.length; i += 500) {
      const part = ids.slice(i, i + 500);
      const { error } = await sb.from("stock_items").update({ color }).in("id", part);
      if (error) errs.push(`${color}: ${error.message}`);
      else updated += part.length;
    }
  }
  return ok({ updated, byColor, warns: errs });
}
