/**
 * ลบ "แบบลูกค้า" (job_drawings + ไฟล์ใน bucket drawings) ทั้งหมดของงาน — ใช้ตอนใบเสนอขึ้น Rev
 *   เจ้าของ 3 พ.ย.69: "พอ Rev แล้วกดเข้าแบบยังเป็นแบบเก่า คนทำลืม → มีอัปเดตปุ๊บ แบบเก่าลบออกเลย"
 *   → ลบแถว DB ก่อน (หน้าแบบจะว่าง บังคับอัปโหลด/สแตมป์ใหม่) แล้วค่อยลบไฟล์แบบ best-effort
 *   เรียกด้วย service client (คน Rev อาจเป็นเซลล์ที่ RLS ไม่ให้เขียน job_drawings)
 */
type Sb = { from: (t: string) => any; storage?: any };

export async function purgeJobDrawings(sb: Sb, jobId: string): Promise<{ count: number; names: string[] }> {
  const { data: rows, error } = await sb.from("job_drawings").select("id, pdf_path, pages, original_name, title").eq("job_id", jobId);
  if (error) { console.warn("[drawings purge] select:", error.message); return { count: 0, names: [] }; }
  const list = (rows ?? []) as { id: number; pdf_path: string; pages: unknown; original_name: string; title: string }[];
  if (!list.length) return { count: 0, names: [] };

  const { error: delErr } = await sb.from("job_drawings").delete().in("id", list.map((r) => r.id));
  if (delErr) { console.warn("[drawings purge] delete:", delErr.message); return { count: 0, names: [] }; }

  try {
    const paths: string[] = [];
    for (const r of list) {
      if (r.pdf_path) paths.push(r.pdf_path);
      for (const p of (Array.isArray(r.pages) ? r.pages : []) as { path?: string }[]) if (p?.path && !/^https?:/i.test(p.path)) paths.push(p.path);
    }
    if (paths.length && sb.storage) await sb.storage.from("drawings").remove(paths);
  } catch (e) { console.warn("[drawings purge] storage:", e instanceof Error ? e.message : e); }

  return { count: list.length, names: list.map((r) => r.title || r.original_name || `#${r.id}`) };
}
