// สร้างหน้า index.html รวมใบเสนอราคาทดสอบทั้งหมด (กดดูทีละใบ)
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "ใบเสนอราคาทดสอบ");
const files = readdirSync(OUT).filter((f) => /^quote-\d+\.html$/.test(f)).sort();
const cards = files.map((f) => {
  const html = readFileSync(join(OUT, f), "utf8");
  const cust = (html.match(/ลูกค้า:<\/b>\s*([^<]+)/) || [, "—"])[1].trim();
  const total = (html.match(/รวมทั้งสิ้น<\/span><span>([^<]+)/) || [, ""])[1].trim();
  const no = (html.match(/เลขที่\s*([A-Z0-9_]+)/) || [, ""])[1];
  const pdf = f.replace(".html", ".pdf");
  return `<a class="card" href="${encodeURIComponent(pdf)}" target="_blank">
    <div class="n">${f.replace("quote-", "ใบ ").replace(".html", "")}</div>
    <div class="c">${cust}</div>
    <div class="m"><span>${no}</span><span class="t">${total || ""}</span></div>
    <div class="lk">เปิด PDF · <a href="${encodeURIComponent(f)}" target="_blank">ดู HTML</a></div>
  </a>`;
}).join("");
const out = `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>ใบเสนอราคาทดสอบ — JR</title><style>
*{box-sizing:border-box;font-family:"Sarabun","Leelawadee UI","Segoe UI",Tahoma,sans-serif;margin:0;}
body{background:linear-gradient(135deg,#fbe6e6,#fef4f1 40%,#eef1fb);min-height:100vh;color:#1f2937;padding:24px;}
.wrap{max-width:1000px;margin:0 auto;}
h1{color:#B3151D;font-size:24px;}
.sub{color:#6b7280;font-size:13px;margin:4px 0 18px;}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px;}
.card{display:block;background:#fff;border:1px solid #eee;border-left:4px solid #B3151D;border-radius:12px;padding:14px 16px;text-decoration:none;color:inherit;box-shadow:0 4px 12px rgba(31,33,39,.06);transition:transform .12s;}
.card:hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(179,21,29,.15);}
.card .n{font-size:12px;color:#B3151D;font-weight:700;}
.card .c{font-size:15px;font-weight:600;margin:3px 0;}
.card .m{display:flex;justify-content:space-between;font-size:12px;color:#6b7280;margin-top:6px;}
.card .m .t{color:#B3151D;font-weight:800;font-size:14px;}
.card .lk{font-size:11px;color:#6b7280;margin-top:8px;border-top:1px dashed #eee;padding-top:6px;}
.card .lk a{color:#B3151D;}
</style></head><body><div class="wrap">
<h1>ใบเสนอราคาทดสอบ — JR Aluminium &amp; Glass</h1>
<div class="sub">${files.length} ใบ · งานทดสอบระบบ (รูปแบบจริงจากเครื่องคิดราคา) · กดการ์ดเพื่อเปิด PDF</div>
<div class="grid">${cards}</div>
</div></body></html>`;
writeFileSync(join(OUT, "index.html"), out, "utf8");
console.log("สร้าง index.html (" + files.length + " ใบ)");
