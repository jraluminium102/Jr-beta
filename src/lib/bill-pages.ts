"use client";
// bill-pages.ts — แปลงไฟล์ที่ธุรการสแกน/ถ่าย (PDF หลายหน้า หรือรูป) → รูป JPG ทีละหน้า ในเบราว์เซอร์
//   ทำไมต้องแปลงที่เบราว์เซอร์: ไฟล์สแกนทั้งตั้งใหญ่หลายสิบ MB ส่งเข้า API ทีเดียวไม่ได้ (เพดาน ~4.5 MB)
//   → ตัดเป็นหน้า ย่อด้านยาวไม่เกิน MAX_LONG_SIDE แล้วส่งให้ AI อ่านทีละหน้า · ได้รูปตัวอย่างไว้ให้คนเทียบด้วย
//   worker ของ pdfjs: /pdfjs/pdf.worker.min.mjs (คัดลอกตอน npm install — scripts/copy-pdfjs-worker.mjs)
//
// ⚠ หน้าไหนแปลงพลาด ต้อง "คืนเป็นหน้าเสีย" แล้วไปหน้าถัดไป — ห้าม throw ทั้งไฟล์ (PDF 100 หน้าที่หน้า 5 เสีย หน้า 6–100 ต้องยังถูกอ่าน)

// ⚠ ห้าม import pdfjs-dist ที่ top-level (แตะ browser globals ตอนโหลด → SSR พัง) — ดู lib/job-drawings/pdf-render.ts
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

/** ด้านยาวของรูปที่ส่งให้ AI — ตัวเลขเล็ก ๆ บนบิล A4 ยังอ่านได้ และไฟล์ไม่เกินเพดาน */
const MAX_LONG_SIDE = 2200;
const MAX_BYTES = 3.5 * 1024 * 1024;

/** หน้าที่แปลงได้ (blob) หรือหน้าที่แปลงไม่ได้ (error) — ref = "ชื่อไฟล์ หน้า N" */
export type BillPage = { ref: string; blob: Blob; error?: undefined } | { ref: string; blob?: undefined; error: string };

async function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  try {
    for (const q of [0.85, 0.7, 0.55]) {
      const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", q));
      if (blob && blob.size <= MAX_BYTES) return blob;
    }
    throw new Error("รูปหน้านี้ใหญ่เกินไปแม้ย่อแล้ว — สแกนใหม่ที่ความละเอียดต่ำลง");
  } finally {
    // คืนแรมของ canvas ทันที (Safari เก็บ canvas ค้างจนเกินโควตา แล้ว toBlob ได้ null)
    canvas.width = 0; canvas.height = 0;
  }
}

function newCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w)); canvas.height = Math.max(1, Math.round(h));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("เบราว์เซอร์นี้สร้างรูปไม่ได้ — ลองเบราว์เซอร์อื่น");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height); // JPG ไม่มีพื้นใส
  return { canvas, ctx };
}

export const isPdf = (f: File) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);
export const isImage = (f: File) => /^image\/(jpeg|png|webp)$/.test(f.type) || /\.(jpe?g|png|webp)$/i.test(f.name);
const msg = (e: unknown) => (e instanceof Error ? e.message : "แปลงหน้านี้เป็นรูปไม่สำเร็จ");

/**
 * คืนทีละหน้า (ไม่ถือทุกหน้าไว้ในแรมพร้อมกัน) · onTotal บอกจำนวนหน้าของไฟล์นี้เมื่อรู้
 * ไฟล์เปิดไม่ได้ทั้งไฟล์ = คืน 1 รายการ error
 */
export async function* filePages(file: File, onTotal?: (n: number) => void): AsyncGenerator<BillPage> {
  if (isPdf(file)) {
    let task: ReturnType<PdfjsModule["getDocument"]> | null = null;
    try {
      const pdfjs = await loadPdfjs();
      task = pdfjs.getDocument({ data: await file.arrayBuffer() });
      const pdf = await task.promise;
      onTotal?.(pdf.numPages);
      for (let i = 1; i <= pdf.numPages; i++) {
        const ref = pdf.numPages > 1 ? `${file.name} หน้า ${i}` : file.name;
        try {
          const page = await pdf.getPage(i);
          const base = page.getViewport({ scale: 1 });
          const scale = Math.min(4, MAX_LONG_SIDE / Math.max(base.width, base.height));
          const viewport = page.getViewport({ scale });
          const { canvas, ctx } = newCanvas(viewport.width, viewport.height);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pdfjs-dist RenderParameters เข้มกว่าที่ใช้จริง
          await page.render({ canvasContext: ctx, viewport } as any).promise;
          const blob = await canvasToJpeg(canvas);
          page.cleanup();
          yield { ref, blob };
        } catch (e) {
          yield { ref, error: msg(e) };
        }
      }
    } catch (e) {
      onTotal?.(1);
      yield { ref: file.name, error: `เปิดไฟล์ PDF ไม่ได้ — ${msg(e)}` };
    } finally {
      try { await task?.destroy(); } catch { /* ปิดไฟล์ไม่ได้ก็ไม่เป็นไร */ }
    }
    return;
  }
  onTotal?.(1);
  if (!isImage(file)) { yield { ref: file.name, error: "รองรับเฉพาะ PDF หรือรูป JPG / PNG" }; return; }
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
    const scale = Math.min(1, MAX_LONG_SIDE / Math.max(bmp.width, bmp.height));
    const { canvas, ctx } = newCanvas(bmp.width * scale, bmp.height * scale);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    yield { ref: file.name, blob: await canvasToJpeg(canvas) };
  } catch (e) {
    yield { ref: file.name, error: msg(e) };
  }
}
