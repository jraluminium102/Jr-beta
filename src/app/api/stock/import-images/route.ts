import { getProfile } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";
import { createServiceClient } from "@/lib/supabase/admin";
import DATA from "@/app/(app)/stock/import/full-import.json";

// นำเข้าสินค้าจากไฟล์ Stock1 → สร้าง stock_items ใหม่ + ดึงรูป Drive เข้า Supabase Storage
// idempotent: ข้ามตัวที่ชื่อซ้ำ (กดซ้ำไม่เพิ่มซ้ำ) · qty เซ็ตยอดยกมาตรงๆ · น็อต = ต่อโล ไม่ใส่ราคา
type Item = { tab: string; cat: string; name: string; price: string; qty: string; fileId: string | null; weight: boolean };
const ITEMS = DATA as Item[];
const STORE_WRITE = ["ADMIN", "PRODUCTION", "SALES", "ACCOUNTING"];
const norm = (s: string) => String(s || "").replace(/\s+/g, " ").trim().toLowerCase();

async function fetchDriveImage(fileId: string): Promise<{ buf: Buffer; ct: string } | null> {
  for (const url of [`https://drive.google.com/uc?export=download&id=${fileId}`, `https://drive.google.com/thumbnail?id=${fileId}&sz=w1600`]) {
    try {
      const r = await fetch(url, { redirect: "follow" });
      if (!r.ok) continue;
      const ct = (r.headers.get("content-type") || "").toLowerCase();
      if (!ct.startsWith("image/")) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 100) continue;
      return { buf, ct };
    } catch { /* try next */ }
  }
  return null;
}

export async function POST(req: Request) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!STORE_WRITE.includes(profile.role)) return FORBIDDEN();

  const body = await req.json().catch(() => ({}));
  const mode = body?.mode ?? "plan";
  const sb = createServiceClient();

  // ── โหมด plan: นับว่าใหม่/มีแล้วกี่ตัว ──
  if (mode === "plan") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (sb as any).from("stock_items").select("name");
    const have = new Set((data ?? []).map((r: { name: string }) => norm(r.name)));
    let existing = 0;
    for (const it of ITEMS) if (have.has(norm(it.name))) existing++;
    return ok({ total: ITEMS.length, existing, toInsert: ITEMS.length - existing });
  }

  // ── โหมด run: ประมวลผลทีละชุด (offset..offset+limit) ──
  const offset = Math.max(0, Number(body?.offset) || 0);
  const limit = Math.min(40, Math.max(1, Number(body?.limit) || 25));
  const slice = ITEMS.slice(offset, offset + limit);

  // ชื่อที่มีอยู่แล้ว (กันซ้ำ) + map หมวด→id
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [{ data: existRows }, { data: cats }] = await Promise.all([
    (sb as any).from("stock_items").select("name"),
    (sb as any).from("stock_categories").select("id, name"),
  ]);
  const have = new Set((existRows ?? []).map((r: { name: string }) => norm(r.name)));
  const catId: Record<string, number> = {};
  for (const c of cats ?? []) catId[norm(c.name)] = c.id;

  const imgCache = new Map<string, string>();
  let inserted = 0, skipped = 0, failed = 0;
  const errors: string[] = [];

  for (const it of slice) {
    const key = norm(it.name);
    if (have.has(key)) { skipped++; continue; }
    have.add(key); // กันซ้ำในชุดเดียวกัน
    try {
      // รูป (dedupe ตาม fileId)
      let image_url = "";
      if (it.fileId) {
        image_url = imgCache.get(it.fileId) || "";
        if (!image_url) {
          const img = await fetchDriveImage(it.fileId);
          if (img) {
            const ext = img.ct.includes("png") ? "png" : img.ct.includes("webp") ? "webp" : "jpg";
            const path = `${crypto.randomUUID()}.${ext}`;
            const up = await sb.storage.from("stock").upload(path, img.buf, { contentType: img.ct, upsert: false });
            if (!up.error) { image_url = sb.storage.from("stock").getPublicUrl(path).data.publicUrl; imgCache.set(it.fileId, image_url); }
          }
        }
      }
      const price = it.weight ? 0 : (Number(it.price) || 0);
      const qty = Number(it.qty) || 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (sb as any).from("stock_items").insert({
        sku: "",
        name: it.name.trim(),
        category: it.cat,
        category_id: catId[norm(it.cat)] ?? null,
        unit: it.weight ? "กก." : "",
        min_qty: 0,
        qty_on_hand: qty,            // เซ็ตยอดยกมาตรงๆ (ไม่ผ่านสมุด ตามที่เจ้าของเลือก)
        note: "",
        supplier: "Stock1",
        image_url,
        is_weight_based: it.weight,
        weight_per_unit: 0,
        price_per_kg: 0,
        unit_cost: price,
      });
      if (error) throw new Error(error.message);
      inserted++;
    } catch (e) {
      failed++;
      if (errors.length < 5) errors.push(`${it.name}: ${e instanceof Error ? e.message : "err"}`);
    }
  }

  const nextOffset = offset + limit;
  return ok({ inserted, skipped, failed, errors, nextOffset, done: nextOffset >= ITEMS.length, total: ITEMS.length });
}
