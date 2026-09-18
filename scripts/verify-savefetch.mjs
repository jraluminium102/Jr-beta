// verify-savefetch — ปุ่มบันทึกหน้าใบเสนอต้องไม่ค้าง (เจ้าของแจ้ง 18 ก.ย.69 "พิมพ์แล้วค้าง กดอะไรไม่ได้ ไม่เซฟ")
//   จำลอง: ตอบปกติ · API error · Vercel ตัด (504 HTML) · เน็ตหลุด · ตอบช้าเกินเวลา
import { pathToFileURL } from "node:url";
const { saveFetch } = await import("../src/lib/saveFetch.ts");
let pass = 0, fail = 0;
const ok = (t, c, x = "") => { console.log((c ? "✅ " : "❌ ") + t + (c ? "" : "  " + x)); c ? pass++ : fail++; };
// ① ปกติ
globalThis.fetch = async () => new Response(JSON.stringify({ data: 1 }), { status: 200 });
let r = await saveFetch("/x", {}); ok("ตอบปกติ → ok", r.ok && r.json?.data === 1);
// ② API ตอบ error พร้อมข้อความ
globalThis.fetch = async () => new Response(JSON.stringify({ error: "ใบนี้ถูกล็อก" }), { status: 409 });
r = await saveFetch("/x", {}); ok("API error → ส่งข้อความเดิมกลับ", !r.ok && r.error === "ใบนี้ถูกล็อก", r.error);
// ③ Vercel ตัด (504 หน้า HTML) — เดิมตรงนี้ res.json() โยน error แล้วค้าง
globalThis.fetch = async () => new Response("<html>504 Gateway Timeout</html>", { status: 504 });
r = await saveFetch("/x", {}); ok("504 HTML → ไม่โยน + บอกให้กดบันทึกอีกครั้ง", !r.ok && /504/.test(r.error), r.error);
// ④ เน็ตหลุด — fetch โยน
globalThis.fetch = async () => { throw new TypeError("Failed to fetch"); };
r = await saveFetch("/x", {}); ok("เน็ตหลุด → ไม่โยน + บอกเน็ตหลุด", !r.ok && /เน็ตหลุด/.test(r.error), r.error);
// ⑤ ตอบช้าเกินเวลา
globalThis.fetch = (url, init) => new Promise((_, rej) => init.signal.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError"))));
const t0 = Date.now(); r = await saveFetch("/x", {}, 300);
ok("ช้าเกินเวลา → หยุดรอเอง + บอกเช็ค Rev ซ้ำ", !r.ok && r.timedOut && /Rev/.test(r.error) && Date.now() - t0 < 2000, r.error);
console.log(`สรุป ✅ ${pass} · ❌ ${fail}`);
