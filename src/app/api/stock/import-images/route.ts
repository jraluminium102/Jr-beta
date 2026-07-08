import { getProfile } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";
import { createServiceClient } from "@/lib/supabase/admin";

// นำเข้ารูปจากลิงก์ Google Drive → อัปเข้า Supabase Storage (bucket 'stock') → เซ็ต stock_items.image_url
// display/รูปเท่านั้น: ไม่แตะราคา/ชื่อ/หมวด · จับคู่ด้วย stockId ที่ส่งมา (จับคู่ในเครื่องแล้ว) · dedupe รูปซ้ำ (fileId)
const STORE_WRITE = ["ADMIN", "PRODUCTION", "SALES", "ACCOUNTING"];

// โหลดรูปจาก Drive: uc?export=download ก่อน · ถ้าไม่ใช่รูป (ไฟล์ใหญ่/interstitial) fallback thumbnail
async function fetchDriveImage(fileId: string): Promise<{ buf: Buffer; ct: string }> {
  const tryUrls = [
    `https://drive.google.com/uc?export=download&id=${fileId}`,
    `https://drive.google.com/thumbnail?id=${fileId}&sz=w1600`,
  ];
  for (const url of tryUrls) {
    const r = await fetch(url, { redirect: "follow" });
    if (!r.ok) continue;
    const ct = (r.headers.get("content-type") || "").toLowerCase();
    if (!ct.startsWith("image/")) continue;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 100) continue;
    return { buf, ct };
  }
  throw new Error("โหลดรูปจาก Drive ไม่ได้ (ไฟล์อาจไม่ public หรือไม่ใช่รูป)");
}

export async function POST(req: Request) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!STORE_WRITE.includes(profile.role)) return FORBIDDEN();

  const body = await req.json().catch(() => null);
  const items: { stockId: number; fileId: string }[] = Array.isArray(body?.items) ? body.items : [];
  if (!items.length) return fail("ไม่มีรายการให้นำเข้า");
  if (items.length > 100) return fail("นำเข้าครั้งละไม่เกิน 100 รายการ");

  const sb = createServiceClient();
  const cache = new Map<string, string>(); // fileId → publicUrl (อัปรูปเดียวใช้ซ้ำหลายสินค้า)
  const results: { stockId: number; ok: boolean; image_url?: string; error?: string }[] = [];

  for (const it of items) {
    const stockId = Number(it.stockId);
    const fileId = String(it.fileId || "").trim();
    if (!stockId || !fileId) { results.push({ stockId, ok: false, error: "ข้อมูลไม่ครบ" }); continue; }
    try {
      let url = cache.get(fileId);
      if (!url) {
        const { buf, ct } = await fetchDriveImage(fileId);
        const ext = ct.includes("png") ? "png" : ct.includes("webp") ? "webp" : "jpg";
        const path = `${crypto.randomUUID()}.${ext}`;
        const up = await sb.storage.from("stock").upload(path, buf, { contentType: ct, upsert: false });
        if (up.error) throw new Error(up.error.message);
        url = sb.storage.from("stock").getPublicUrl(path).data.publicUrl;
        cache.set(fileId, url);
      }
      // เซ็ตเฉพาะ image_url — ไม่แตะราคา/ชื่อ/หมวด
      const { error } = await sb.from("stock_items").update({ image_url: url } as never).eq("id", stockId);
      if (error) throw new Error(error.message);
      results.push({ stockId, ok: true, image_url: url });
    } catch (e) {
      results.push({ stockId, ok: false, error: e instanceof Error ? e.message : "ผิดพลาด" });
    }
  }

  return ok({ results, uploaded: cache.size });
}
