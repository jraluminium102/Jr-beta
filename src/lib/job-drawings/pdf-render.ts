"use client";
// pdf-render.ts — render PDF → รูป PNG ต่อหน้า (ในเบราว์เซอร์ ด้วย pdfjs-dist) แล้วอัปโหลดเข้า Supabase Storage
//   ทำไมต้อง render เป็นรูป: ให้ overlay ข้อความวางทับได้ตรงตำแหน่งเป๊ะ (สัดส่วน xf/yf) โดยไม่ต้องพึ่ง PDF text-layer/ฟอนต์ไทยฝัง
//   worker: ใช้ path static /pdfjs/pdf.worker.min.mjs (คัดลอกไว้ตอน npm install — ดู scripts/copy-pdfjs-worker.mjs)
//   แทนที่จะใช้ new URL(..., import.meta.url) ซึ่งบาง setup ของ Next.js/webpack bundle asset พลาดเงียบ ๆ
import { createClient } from "@/lib/supabase/client";

// ⚠ ห้าม import pdfjs-dist ที่ top-level: pdfjs v6 แตะ browser globals ตอนโหลดโมดูล →
//   Next SSR หน้า editor (แม้เป็น "use client") จะ eval โมดูลนี้บน server แล้วพัง 500 (เจอจริงบน Vercel)
//   → โหลดแบบ dynamic เฉพาะตอนเรียกใช้ (ฝั่งเบราว์เซอร์เท่านั้น) + cache promise
type PdfjsModule = typeof import("pdfjs-dist");
let pdfjsPromise: Promise<PdfjsModule> | null = null;
function loadPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((mod) => {
      mod.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
      return mod;
    });
  }
  return pdfjsPromise;
}

export type RenderedPage = { blob: Blob; w: number; h: number };

// เพดานความยาวด้านที่ยาวสุดของรูป (px) — กันไฟล์ใหญ่เกินจำเป็น/มือถือเครื่องเก่าแรม canvas ไม่พอ
const MAX_LONG_SIDE = 2000;

export async function renderPdfPages(
  file: File,
  onPage?: (i: number, total: number) => void
): Promise<RenderedPage[]> {
  const pdfjsLib = await loadPdfjs();
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const pages: RenderedPage[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    onPage?.(i, pdf.numPages);
    const page = await pdf.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const longSide = Math.max(base.width, base.height);
    const scale = Math.min(3, Math.max(1, MAX_LONG_SIDE / longSide));
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("เบราว์เซอร์นี้สร้าง canvas ไม่ได้ — ลองเครื่อง/เบราว์เซอร์อื่น");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pdfjs-dist RenderParameters เข้มกว่าที่ canvas 2d context จริงต้องใช้งาน
    await page.render({ canvasContext: context, viewport } as any).promise;

    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error(`แปลงหน้า ${i} เป็นรูปไม่สำเร็จ`);
    pages.push({ blob, w: canvas.width, h: canvas.height });
  }
  return pages;
}

export type UploadedDrawing = { pdf_path: string; original_name: string; pages: { path: string; w: number; h: number }[] };

// อัปโหลด PDF ต้นฉบับ + รูปทุกหน้า เข้า bucket 'drawings' (path สัมพัทธ์ — ดู lib/job-drawings/storage.ts)
export async function uploadDrawingFiles(
  jobId: string,
  file: File,
  onProgress?: (msg: string) => void
): Promise<UploadedDrawing> {
  const supabase = createClient();
  const folder = `${jobId}/${crypto.randomUUID()}`;

  onProgress?.("กำลังอ่านไฟล์ PDF…");
  const rendered = await renderPdfPages(file, (i, total) => onProgress?.(`กำลังแปลงหน้า ${i}/${total}…`));

  onProgress?.("กำลังอัปโหลดไฟล์ต้นฉบับ…");
  const pdfPath = `${folder}/original.pdf`;
  const { error: pdfErr } = await supabase.storage.from("drawings").upload(pdfPath, file, { upsert: false, contentType: "application/pdf" });
  if (pdfErr) throw new Error(pdfErr.message);

  const pages: { path: string; w: number; h: number }[] = [];
  for (let i = 0; i < rendered.length; i++) {
    onProgress?.(`กำลังอัปโหลดหน้า ${i + 1}/${rendered.length}…`);
    const p = rendered[i];
    const path = `${folder}/page-${i + 1}.png`;
    const { error } = await supabase.storage.from("drawings").upload(path, p.blob, { upsert: false, contentType: "image/png" });
    if (error) throw new Error(error.message);
    pages.push({ path, w: p.w, h: p.h });
  }

  return { pdf_path: pdfPath, original_name: file.name, pages };
}
