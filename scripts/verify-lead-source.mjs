// verify-lead-source.mjs — ทดสอบ "ที่มาของลูกค้า + รหัสแอด" (0175) แบบไม่ต่อฐานข้อมูล/เน็ต
//   รัน: node scripts/verify-lead-source.mjs
//   ครอบคลุม: อ่านรหัสแอดจากข้อความที่วาง · เดาที่มาจากตัวอักษรนำ · ไม่เจอรหัส = ไม่เดา ·
//             วางข้อความแบบเดิม (ไม่มีรหัส) ต้องได้ผลเหมือนเดิม · กันพังเมื่อยังไม่รัน migration · migration + ฟอร์ม + API ต่อครบ
//   วิธี: แปลง .ts → .mjs ชั่วคราว (typescript.transpileModule) เหมือน verify-queue-suggest.mjs
//   ⚠ แก้ src/lib/queue.ts (ส่วนที่มา) หรือ src/lib/queue-paste.ts ต้องรันไฟล์นี้
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vls-"));
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const transpile = (src) =>
  ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;

fs.writeFileSync(path.join(tmp, "queue.mjs"), transpile(read("src/lib/queue.ts")));
fs.writeFileSync(path.join(tmp, "queue-paste.mjs"), transpile(read("src/lib/queue-paste.ts")).replace(/"\.\/queue"/, '"./queue.mjs"'));
const Q = await import(pathToFileURL(path.join(tmp, "queue.mjs")).href);
const P = await import(pathToFileURL(path.join(tmp, "queue-paste.mjs")).href);

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { pass++; } else { fail++; console.log(`✗ ${name}\n    ได้    ${a}\n    ควรเป็น ${b}`); }
};
const ok = (name, cond) => eq(name, !!cond, true);

// ── ① ชุดค่าที่มา: ปิด 7 ค่า ตรงกับ migration ──
eq("① ชุดที่มา 7 ค่า", [...Q.LEAD_SOURCES], ["FB_AD", "TIKTOK", "YOUTUBE", "GOOGLE_MAPS", "REFERRAL", "OTHER", "UNKNOWN"]);
eq("① ป้ายไทยครบ", Q.LEAD_SOURCES.map((k) => Q.LEAD_SOURCE_LABEL[k]), ["เฟซบุ๊ก / ไอจี", "TikTok", "YouTube", "Google Maps", "เพื่อนหรือคนรู้จักแนะนำ", "อื่น ๆ", "ไม่ทราบ"]);
// ตัวเลือกในฟอร์มคิวต้องตรงกับแบบสอบถามที่ส่งลูกค้า ทั้งเลขและชื่อ (เจ้าของท้วง 26 พ.ย.69 ว่าไม่แมช)
eq("① ตัวเลือกในฟอร์ม = เลข + ชื่อ ตามแบบสอบถาม", Q.LEAD_SOURCES.map((k) => Q.leadSourceOptionLabel(k)),
  ["1 · เฟซบุ๊ก / ไอจี", "2 · TikTok", "3 · YouTube", "4 · Google Maps", "5 · เพื่อนหรือคนรู้จักแนะนำ", "6 · อื่น ๆ", "ไม่ทราบ / ลูกค้าไม่ตอบ"]);
eq("① แบบสอบถาม (ถ้อยคำเจ้าของ)", Q.LEAD_SURVEY_TEXT, [
  "หากลูกค้าสะดวก รบกวนตอบแบบสอบถามสั้น ๆ ให้ทางร้านหน่อยนะคะ 🙏",
  "ลูกค้ารู้จัก JR จากช่องทางไหนคะ",
  "1 เฟซบุ๊ก / ไอจี", "2 TikTok", "3 YouTube", "4 Google Maps", "5 เพื่อนหรือคนรู้จักแนะนำ", "6 อื่น ๆ",
  "ตอบเป็นตัวเลขได้เลยค่ะ ขอบคุณมากนะคะ",
].join("\n"));
const mig = read("supabase/migrations/0175_queue_lead_source.sql");
for (const k of Q.LEAD_SOURCES) ok(`① migration มีค่า ${k}`, mig.includes(`'${k}'`));
ok("① migration idempotent (add column if not exists)", /add column if not exists lead_source text/.test(mig) && /add column if not exists lead_source_code text/.test(mig));
ok("① migration ยอมให้ว่าง (ไม่ not null)", !/lead_source[^,;]*not null/i.test(mig.replace(/is not null/gi, "").replace(/not valid/gi, "")));

// ── ② เดาที่มาจากตัวอักษรนำ ──
eq("② A12 → แอดเฟส", Q.leadSourceFromCode("A12"), "FB_AD");
eq("② t3 → TikTok (ตัวเล็กก็ได้)", Q.leadSourceFromCode("t3"), "TIKTOK");
eq("② Y1 → YouTube", Q.leadSourceFromCode("Y1"), "YOUTUBE");
eq("② G05 → Google Maps", Q.leadSourceFromCode("G05"), "GOOGLE_MAPS");
eq("② B7 → ไม่เดา", Q.leadSourceFromCode("B7"), null);
eq("② ว่าง → ไม่เดา", Q.leadSourceFromCode(""), null);
eq("② AB1 (2 ตัวอักษร) → ไม่เดา", Q.leadSourceFromCode("AB1"), null);
eq("② ADS → ไม่เดา (ไม่มีเลข)", Q.leadSourceFromCode("ADS"), null);
eq("② จัดรูปรหัส", Q.normLeadCode("  a 12 "), "A12");
eq("② ตัดยาวเกิน 20", Q.normLeadCode("A".repeat(50)).length, 20);
eq("② ค่าแปลก → ไม่ทราบ", Q.leadSourceKey("XXX"), "UNKNOWN");
eq("② null → ไม่ทราบ", Q.leadSourceKey(null), "UNKNOWN");
eq("② ค่าถูก → คงเดิม", Q.leadSourceKey("TIKTOK"), "TIKTOK");

// ── ③ อ่านรหัสจากข้อความ ──
const code = (t) => { const r = Q.parseLeadCode(t); return r ? [r.code, r.source] : null; };
eq("③ ข้อความทักจากแอด", code("สนใจหน้าต่างบานยกครับ (A12)"), ["A12", "FB_AD"]);
eq("③ (T3)", code("สนใจกั้นห้องกระจกค่ะ (T3)"), ["T3", "TIKTOK"]);
eq("③ (Y1)", code("ขอราคาหลังคาครับ (Y1)"), ["Y1", "YOUTUBE"]);
eq("③ (G2)", code("สอบถามครับ (G2)"), ["G2", "GOOGLE_MAPS"]);
eq("③ วงเล็บเต็มความกว้าง + ช่องว่าง + จุดท้าย", code("สนใจครับ （ a12 ） ."), ["A12", "FB_AD"]);
// ตัวอักษรนำที่ไม่รู้จัก = รุ่นสินค้า/เลขห้อง/ชื่อเล่น ไม่ใช่รหัสแอด (QA 20 พ.ย.69) — ไม่เติมอะไรเลย
for (const t of ["สนใจครับ (B7)", "บานเลื่อน (S2)", "ห้อง (B12)", "รุ่น FUJI (F2)", "คุณ John (JR1)", "คุณวิภา (K9)", "สนใจครับ (AB1)"])
  eq(`③ ไม่ใช่รหัสแอด: ${t}`, code(t), null);
eq("③ ข้ามบรรทัดที่ไม่ใช่รหัสแอด ไปเจอรหัสจริงบรรทัดถัดไป", code("บานเลื่อน (S2)\nสนใจครับ (A12)"), ["A12", "FB_AD"]);
// "ไม่ทราบ" เฉย ๆ ไม่นับว่าคิวบอกที่มา (ไม่ทับที่มาจริงของคิวอื่น)
eq("③ hasLeadInfo", [Q.hasLeadInfo({ lead_source: "UNKNOWN" }), Q.hasLeadInfo({ lead_source: "UNKNOWN", lead_source_code: "A1" }), Q.hasLeadInfo({ lead_source: "REFERRAL" }), Q.hasLeadInfo({}), Q.hasLeadInfo(null)], [false, true, true, false, false]);
eq("③ ตัดรหัสยาวไม่ผ่ากลางอีโมจิ", Array.from(Q.normLeadCode("a".repeat(19) + "😀😀")).length, 20);
ok("③ รหัสที่ตัดแล้วเป็นข้อความสมบูรณ์", Q.normLeadCode("a".repeat(19) + "😀😀").isWellFormed?.() ?? true);
eq("③ ไม่มีรหัส → null", code("สนใจหน้าต่างบานยกครับ"), null);
eq("③ วงเล็บกลางบรรทัด ไม่นับ", code("อาคาร (A2) ชั้น 3 ห้อง 12"), null);
eq("③ วงเล็บที่ไม่ใช่รหัส ไม่นับ", code("คุณสมชาย (เพื่อนคุณเอ)"), null);
eq("③ วงเล็บเลขล้วน ไม่นับ", code("บานเลื่อน 2 ชุด (12)"), null);
eq("③ ยาวเกินรูปแบบ ไม่นับ", code("สนใจครับ (ABC123)"), null);
eq("③ ลิงก์ที่ลงท้ายวงเล็บ ไม่นับ", code("https://example.com/x_(A12)"), null);
eq("③ ข้อความว่าง", code(""), null);
eq("③ หลายบรรทัด เอารหัสแรก", code("คุณเอ 081-234-5678\nสนใจครับ (A12)\nอีกอัน (T9)"), ["A12", "FB_AD"]);

// ── ④ วางข้อความลูกค้า → เติมฟอร์ม ──
const blob = [
  "สนใจหน้าต่างบานยกครับ (A12)",
  "K.Avinash 082-271-4312",
  "เลขที่ 144/160 หมู่บ้านเดอะแกรนด์ ตำบลกะทู้ อำเภอกะทู้ ภูเก็ต 83120",
  "https://maps.app.goo.gl/abc123",
  "FB Avinash Pednekar",
].join("\n");
const p1 = P.parseContactBlob(blob);
eq("④ เติมรหัส", p1.lead_source_code, "A12");
eq("④ เติมที่มา", p1.lead_source, "FB_AD");
eq("④ ชื่อไม่ใช่ข้อความทัก", p1.customer_name, "K.Avinash");
eq("④ เบอร์", p1.tel, "082-271-4312");
eq("④ ลิงก์แมพ", p1.location_url, "https://maps.app.goo.gl/abc123");
eq("④ ช่องทาง FB", [p1.contact_channel, p1.line_contact], ["FB", "Avinash Pednekar"]);
ok("④ ที่อยู่", String(p1.address).includes("ตำบลกะทู้"));

// วางแบบเดิม (ไม่มีรหัส) ต้องได้ผลเหมือนก่อนเพิ่มฟีเจอร์ — ไม่มีคีย์ที่มาโผล่
const p2 = P.parseContactBlob(blob.split("\n").slice(1).join("\n"));
eq("④ ไม่มีรหัส → ไม่เติมที่มา (ห้ามเดา)", [p2.lead_source, p2.lead_source_code], [undefined, undefined]);
eq("④ ไม่มีรหัส → ส่วนอื่นเหมือนเดิม", [p2.customer_name, p2.tel, p2.location_url, p2.contact_channel], ["K.Avinash", "082-271-4312", "https://maps.app.goo.gl/abc123", "FB"]);

const p3 = P.parseContactBlob("สนใจหน้าต่างบานยกครับ (A12)");
eq("④ วางแค่ข้อความทัก → ได้แต่ที่มา ไม่ตั้งชื่อลูกค้ามั่ว", p3, { lead_source_code: "A12", lead_source: "FB_AD" });

const p4 = P.parseContactBlob("คุณสมชาย 081-234-5678 (T3)");
eq("④ รหัสท้ายบรรทัดชื่อ+เบอร์ → ชื่อไม่ติดรหัส", [p4.customer_name, p4.tel, p4.lead_source_code, p4.lead_source], ["คุณสมชาย", "081-234-5678", "T3", "TIKTOK"]);

const p5 = P.parseContactBlob("คุณสมชาย\nคอนโดลุมพินี ถนนพระราม 9 เขตห้วยขวาง (A2)");
eq("④ วงเล็บท้ายบรรทัดที่อยู่ ไม่ใช่รหัสแอด", [p5.lead_source_code, p5.lead_source], [undefined, undefined]);
ok("④ ที่อยู่ยังครบ (รวมวงเล็บ)", String(p5.address).includes("(A2)"));

const p6 = P.parseContactBlob("สนใจครับ (B7)\nคุณวิทย์ 0891112222");
eq("④ วงเล็บที่ไม่ใช่รหัสแอด → ไม่เติมที่มา · ส่วนอื่นอ่านเหมือนเดิม", [p6.lead_source_code, p6.lead_source, p6.customer_name, p6.tel], [undefined, undefined, "คุณวิทย์", "0891112222"]);
const p8 = P.parseContactBlob("คุณวิภา (K9) 081-234-5678\nบานเลื่อน (S2)");
eq("④ ชื่อเล่น/รุ่นในวงเล็บ ไม่ถูกตัดออกจากชื่อ", [p8.customer_name, p8.lead_source_code], ["คุณวิภา (K9)", undefined]);

const p7 = P.parseContactBlob("สนใจครับ 0891112222 (Y4)");
eq("④ ข้อความทักมีเบอร์อยู่ด้วย → เบอร์ไม่หาย", [p7.tel, p7.lead_source_code, p7.lead_source], ["0891112222", "Y4", "YOUTUBE"]);

// ── ⑤ กันพัง: ยังไม่รัน migration → ตัดคอลัมน์ที่ฐานข้อมูลยังไม่มีแล้วบันทึกต่อได้ ──
const row = { customer_name: "ก", lead_source: "FB_AD", lead_source_code: "A12", bill_postal: "10110" };
eq("⑤ ไม่มีคอลัมน์ lead_source (PostgREST)", Q.dropMissingQueueCols(row, "Could not find the 'lead_source' column of 'queue_entries' in the schema cache"), { customer_name: "ก", bill_postal: "10110" });
eq("⑤ ไม่มีคอลัมน์ lead_source_code (Postgres)", Q.dropMissingQueueCols(row, 'column "lead_source_code" of relation "queue_entries" does not exist'), { customer_name: "ก", bill_postal: "10110" });
eq("⑤ ไม่มีคอลัมน์ bill_postal (ของเดิม 0077)", Q.dropMissingQueueCols(row, "Could not find the 'bill_postal' column of 'queue_entries' in the schema cache"), { customer_name: "ก", lead_source: "FB_AD", lead_source_code: "A12" });
eq("⑤ error อื่น → ไม่ลองใหม่", Q.dropMissingQueueCols(row, "duplicate key value violates unique constraint"), null);
eq("⑤ ค่าผิดกติกา (check) → ไม่กลบ error", Q.dropMissingQueueCols(row, 'new row for relation "queue_entries" violates check constraint "queue_entries_lead_source_chk"'), null);
eq("⑤ ตัดไปแล้ว ไม่วนซ้ำ", Q.dropMissingQueueCols({ customer_name: "ก" }, "Could not find the 'lead_source' column of 'queue_entries' in the schema cache"), null);

// ── ⑥ ต่อสายครบ: ฟอร์ม → API (สร้าง/แก้) → สถิติ (ตรวจจากซอร์ส กันหลุดตอนแก้ทีหลัง) ──
const modal = read("src/components/queue/QueueModal.tsx");
ok("⑥ ฟอร์มส่ง lead_source", /lead_source: f\.lead_source \|\| null/.test(modal));
ok("⑥ ฟอร์มส่ง lead_source_code", /lead_source_code: normLeadCode\(f\.lead_source_code\) \|\| null/.test(modal));
ok("⑥ ฟอร์มอ่านค่าเดิมตอนเปิดแก้", /lead_source_code: e\?\.lead_source_code \?\? ""/.test(modal));
ok("⑥ วางข้อความเติมรหัส+ที่มา", /lead_source_code: p\.lead_source_code \?\? s\.lead_source_code/.test(modal) && /lead_source: p\.lead_source \?\? s\.lead_source/.test(modal));
ok("⑥ ช่องที่มาไม่มี required", !/lead_source[^\n]*\brequired\b/.test(modal));
ok("⑥ ไม่มี setErr ที่อ้างที่มา (ห้ามบล็อกบันทึก)", !/setErr\([^)]*(ที่มา|รหัสแอด)/.test(modal));
for (const [name, file] of [["สร้าง", "src/app/api/queue/route.ts"], ["แก้ไข", "src/app/api/queue/[id]/route.ts"]]) {
  const src = read(file);
  ok(`⑥ API ${name}: รับ lead_source (ไม่บังคับ)`, /lead_source: z\.enum\(LEAD_SOURCES\)\.nullish\(\)/.test(src));
  ok(`⑥ API ${name}: รับ lead_source_code (ไม่บังคับ)`, /lead_source_code: z\.string\(\)\.transform\([^\n]*\)\.nullish\(\)/.test(src));
  ok(`⑥ API ${name}: กันพังเมื่อยังไม่รัน migration`, /dropMissingQueueCols\(/.test(src));
}
ok("⑥ API สร้าง: ลูกค้าเก่าคงที่มาเดิม", /target_customer_id != null \|\| body\.target_job_id/.test(read("src/app/api/queue/route.ts")));
const stats = read("src/app/api/stats/route.ts");
ok("⑥ สถิติ: ส่ง byLeadSource + แถวรวม", /byLeadSource, leadSourceTotal, leadSourceReady/.test(stats));
const leadBlock = stats.slice(stats.indexOf("// ── ที่มาของลูกค้า + รหัสแอด (0175)"), stats.indexOf("// ── ประเภทงานนิยม"));
ok("⑥ สถิติ: ยอดคิดจาก valueOf/depositOf (ไม่ใช้ net_amount)", leadBlock.length > 500 && /for \(const j of depositedJobs\) \{ const v = valueOf\(j\)\.net, d = depositOf\(j\)/.test(leadBlock) && !/net_amount/.test(leadBlock));
ok("⑥ สถิติ: แถวรวมใช้ชุดงานเดียวกับการ์ด", /leadSourceTotal = \{ assessed: cohort\.length[^\n]*deposited: depositedJobs\.length, revenue: mask\(cur\.revenue\), deposit_sum: mask\(cur\.deposit_sum\)/.test(stats));
ok("⑥ สถิติ: เกลี่ยเศษปัดให้บวกแล้วเท่าแถวรวม", /fitMoney\(LEAD_SOURCES/.test(leadBlock) && /codes: fitMoney\(g\.codes, g\)/.test(leadBlock));
ok("⑥ ฟอร์ม: แจ้งหลังบันทึกถ้าฐานข้อมูลยังไม่เก็บที่มา (ไม่บล็อก)", /if \(leadNotSaved\) alert\(/.test(modal));
ok("⑥ สถิติ: ไม่ทราบ โชว์เสมอ", /k === "UNKNOWN" \|\| lsMap\.has\(k\)/.test(stats));
const page = read("src/app/(app)/stats/page.tsx");
ok("⑥ หน้าสถิติ: มีตารางแยกตามที่มา", page.includes("ยอดมัดจำแยกตามที่มาของลูกค้า"));
const pageA = page.slice(page.indexOf("ที่มาของลูกค้า (0175) ───"), page.indexOf("TAB: สถิติ"));
const pageB = page.slice(page.indexOf("{/* (0175) ยอดมัดจำแยกตามที่มา"), page.indexOf("{/* พื้นที่ */}"));
ok("⑥ หน้าสถิติ: ส่วนใหม่ไม่ใช้เครื่องหมายบาท", pageA.length > 300 && pageB.length > 300 && !/฿/.test(pageA) && !/฿/.test(pageB));

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\nverify-lead-source: ผ่าน ${pass} · ไม่ผ่าน ${fail}`);
process.exit(fail ? 1 : 0);
