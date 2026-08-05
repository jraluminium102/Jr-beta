// copy-pdfjs-worker.mjs — คัดลอก pdf.worker ของ pdfjs-dist มาไว้ใน public/pdfjs
//   เหตุผล: ให้ client (สแตมป์สเปคลงแบบ /cover-sheet/[jobId]/drawing) โหลด worker แบบ static path
//   ตรงไปตรงมา ไม่พึ่ง `new URL(..., import.meta.url)` ที่บางเวอร์ชัน Next.js/webpack bundling พลาด
//   รันอัตโนมัติทุกครั้งที่ npm install (postinstall) — กันไฟล์หายตอน deploy ใหม่/เปลี่ยนเวอร์ชัน pdfjs-dist
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url)) + "/..";
const src = path.join(root, "node_modules/pdfjs-dist/build/pdf.worker.min.mjs");
const destDir = path.join(root, "public/pdfjs");
const dest = path.join(destDir, "pdf.worker.min.mjs");

if (!existsSync(src)) {
  console.warn("[copy-pdfjs-worker] ไม่พบ node_modules/pdfjs-dist/build/pdf.worker.min.mjs — ข้าม (pdfjs-dist ยังไม่ได้ติดตั้ง?)");
  process.exit(0);
}
mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
console.log("[copy-pdfjs-worker] copied → public/pdfjs/pdf.worker.min.mjs");
