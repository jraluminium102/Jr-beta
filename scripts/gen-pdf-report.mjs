// gen-pdf-report.mjs — แปลง HTML → PDF ด้วย Chrome headless
import { execSync, execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const IN_HTML = resolve(ROOT, "docs", "สรุปงาน-dev-2026-06-17.html");
const OUT_PDF  = resolve(ROOT, "docs", "สรุปงาน-dev-2026-06-17.pdf");

const CHROME_PATHS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];

let chromePath = null;
for (const p of CHROME_PATHS) {
  if (existsSync(p)) { chromePath = p; break; }
}

if (!chromePath) {
  console.error("[pdf] ไม่พบ Chrome/Edge — ข้าม PDF");
  process.exit(1);
}
console.log(`[pdf] ใช้ browser: ${chromePath}`);

const fileUrl = "file:///" + IN_HTML.replace(/\\/g, "/");
console.log(`[pdf] input: ${fileUrl}`);
console.log(`[pdf] output: ${OUT_PDF}`);

try {
  execFileSync(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--run-all-compositor-stages-before-draw",
    "--disable-extensions",
    `--print-to-pdf=${OUT_PDF}`,
    fileUrl,
  ], { timeout: 45000, stdio: "pipe" });

  if (existsSync(OUT_PDF)) {
    const sz = statSync(OUT_PDF).size;
    console.log(`[pdf] สำเร็จ · ขนาด: ${(sz/1024).toFixed(1)} KB · ${OUT_PDF}`);
  } else {
    console.error("[pdf] Chrome ทำงานแล้ว แต่ไม่พบไฟล์ PDF");
    process.exit(1);
  }
} catch (e) {
  console.error("[pdf] Chrome error:", e.message?.slice(0, 300));
  const se = e.stderr ? e.stderr.toString().slice(0, 200) : "";
  if (se) console.error("[pdf] stderr:", se);
  process.exit(1);
}
