// verify-queue-suggest.mjs — ทดสอบตัวเสนอคิวประเมิน (src/lib/queue-suggest.ts) แบบไม่ต่อฐานข้อมูล/เน็ต
//   รัน: node scripts/verify-queue-suggest.mjs
//   วิธี: แปลง .ts → .mjs ชั่วคราว (typescript.transpileModule) · แทน geocode/ORS/ฐานข้อมูลด้วยของปลอมที่กำหนดเองได้
//   ⚠ แก้ queue-suggest.ts ทุกครั้งต้องรันไฟล์นี้ (เจ้าของ: "ระวังเรื่องนี้ให้ดี")
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vqs-"));

const transpile = (src) =>
  ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const emit = (name, code) => fs.writeFileSync(path.join(tmp, name), code);

emit("queue.mjs", transpile(fs.readFileSync(path.join(root, "src/lib/queue.ts"), "utf8")));
emit("field-stats.mjs", transpile(fs.readFileSync(path.join(root, "src/lib/field-stats.ts"), "utf8")));
emit("context.mjs", "export class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }\n");
emit("db-error.mjs", "export const dbError = (e) => new Error(String(e?.message ?? e));\n");
emit("queue-geo.mjs", "export const resolveMapLink = async () => null;\nexport const geocodeAddress = async (a) => globalThis.__geo?.(a) ?? null;\n");
emit("ors.mjs", "export const drivingMinutes = async (a, b) => globalThis.__ors?.(a, b) ?? null;\n");
const engine = transpile(fs.readFileSync(path.join(root, "src/lib/queue-suggest.ts"), "utf8"))
  .replace(/"@\/lib\/bff\/context"/, '"./context.mjs"')
  .replace(/"@\/lib\/bff\/db-error"/, '"./db-error.mjs"')
  .replace(/"@\/lib\/queue-geo"/, '"./queue-geo.mjs"')
  .replace(/"@\/lib\/field-stats"/, '"./field-stats.mjs"')
  .replace(/"@\/lib\/queue"/, '"./queue.mjs"')
  .replace(/"@\/lib\/ors"/, '"./ors.mjs"');
if (/@\/lib\//.test(engine)) throw new Error("ยังมี import @/lib ที่ไม่ได้แทน — เพิ่ม stub ในไฟล์นี้");
emit("queue-suggest.mjs", engine);
const { computeSuggestion } = await import(pathToFileURL(path.join(tmp, "queue-suggest.mjs")).href);
const { haversineKm } = await import(pathToFileURL(path.join(tmp, "queue.mjs")).href);

// ── ฐานข้อมูลปลอม: from(table) → chain อะไรก็ได้ → คืนข้อมูลของ table ──
const fakeSb = (tables) => ({
  from: (t) => {
    const out = { data: tables[t] ?? [], error: null };
    const single = { data: (tables[t] ?? [])[0] ?? null, error: null };
    const chain = new Proxy(() => {}, {
      get: (_, k) => {
        if (k === "then") return (res) => res(out);
        if (k === "maybeSingle" || k === "single") return async () => single;
        return () => chain;
      },
    });
    return chain;
  },
});

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { if (cond) { pass++; } else { fail++; console.log(`✗ ${name} ${extra}`); } };

// ── ข้อมูลตั้งต้น ──
const addDays = (n) => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return new Date(d.getTime() + n * 86400000); };
const isoOf = (d) => d.toISOString().slice(0, 10);
/** วันทำงาน (ไม่ใช่อาทิตย์) ลำดับที่ k นับจากพรุ่งนี้ */
const workday = (k) => { let n = 0; for (let i = 1; i < 40; i++) { const d = addDays(i); if (d.getUTCDay() !== 0) { n++; if (n === k) return isoOf(d); } } };
const D1 = workday(1), D2 = workday(2), D3 = workday(3);

const LAI = { id: "s-lai", name: "ไล้", code: "lai", role: "MAIN", team: "BKK", active: true, office_slots: [], office_overrides: [] };
const MAC = { id: "s-mac", name: "แม็ก", code: "mac", role: "MAIN", team: "BKK", active: true, office_slots: [], office_overrides: [] };
const SETTINGS = [{ id: 1, max_pair_min: 45, avg_speed_kmh: 40, detour_factor: 1.3, max_pair_km: 8, traffic_factor: 1.5, field_streak_warn: 6 }];

// จุดอ้างอิง (พิกัดจริงโดยประมาณ)
const BANGBUATHONG = { lat: 13.9345514, lng: 100.414914 };   // คุณปองพล
const SALAKLANG = { lat: 13.8135053, lng: 100.3568058 };     // คุณศาริณี (พิกัดประมาณจากที่อยู่)
const NEAR_BBT = { lat: 13.95, lng: 100.43 };                // ห่างบางบัวทอง ~2.4 กม.
const SATHORN = { lat: 13.7200, lng: 100.5290 };
const NONTHABURI = { lat: 13.8190, lng: 100.5040 };          // → สาทร ~11.3 กม.
const RAM24 = { lat: 13.7560, lng: 100.6300 };
const ROMKLAO = { lat: 13.7500, lng: 100.7420 };             // → ราม 24 ~12 กม.
const entry = (id, sales, date, time, co, extra = {}) => ({
  id, sales_id: sales.id, queue_date: date, queue_time: time, status: "CONFIRMED",
  lat: co?.lat ?? null, lng: co?.lng ?? null, customer_name: "คุณ" + id, address: null, job_type: "ประเมินหน้างาน", job_size: null, ...extra,
});
const run = (entries, params, sales = [LAI, MAC]) =>
  computeSuggestion(fakeSb({ queue_settings: SETTINGS, queue_sales: sales, queue_entries: entries, sales_availability: [] }), params);

// ORS ปลอม: เวลาถนนโล่ง (นาที) = ระยะเส้นตรง × ตัวคูณ (ตั้งต่อเคส)
const setOrs = (minPerKm) => { globalThis.__ors = (a, b) => haversineKm(a, b) * minPerKm; };
globalThis.__geo = () => null;

// ① ไม่มีคิวเลย → วันทำงานแรก 10:00
setOrs(1.5);
{
  const r = await run([], { lat: 13.75, lng: 100.5, address: "กรุงเทพ" });
  ok("① ว่างทั้งระบบ → วันทำงานแรก 10:00", r.queue_date === D1 && r.queue_time === "10:00", JSON.stringify(r));
  ok("① reason บอกว่างเร็วสุด", r.reason.includes("ว่างเร็วสุด"));
}

// ② งานใหม่ไม่มีพิกัด → ไม่จับคู่ ไปวันว่างทั้งวัน (กติกาเดิม)
{
  const ents = [entry("a", LAI, D1, "10:00", NEAR_BBT), entry("b", MAC, D1, "10:00", NEAR_BBT)];
  const r = await run(ents, { address: "ที่ไหนสักแห่ง" });
  ok("② ไม่มีพิกัด → ข้ามวันที่มีคิว", r.queue_date === D2, JSON.stringify([r.queue_date, r.reason]));
  ok("② มีข้อความบอกไม่มีพิกัด", r.day_notes.some((n) => n.includes("ไม่มีพิกัดหน้างาน")));
}

// ③ คิวใกล้กันอยู่ "วันถัดไป" (ไม่ใช่วันว่างเร็วสุด) → ต้องเสนอวันเดียวกับคิวใกล้ (หัวใจของเคส 16 พ.ย.69)
{
  // D1: ไล้ว่างทั้งวัน · D2: แม็กมีคิวเช้า ใกล้งานใหม่ 2.4 กม.
  const ents = [entry("m1", MAC, D1, "10:00", SATHORN), entry("m1b", MAC, D1, "14:00", SATHORN), entry("near", MAC, D2, "10:00", NEAR_BBT)];
  const r = await run(ents, { ...BANGBUATHONG, address: "บางบัวทอง นนทบุรี" });
  ok("③ เลือกวันเดียวกับคิวใกล้ (D2 บ่าย แม็ก)", r.queue_date === D2 && r.queue_time === "14:00" && r.sales_name === "แม็ก", JSON.stringify([r.queue_date, r.queue_time, r.sales_name, r.reason]));
  ok("③ reason บอกลงวันเดียวกับคิวใกล้กัน + ระยะ", r.reason.includes("ลงวันเดียวกับคิวที่อยู่ใกล้กัน") && r.reason.includes("กม."));
  ok("③ บอกวันว่างเร็วสุดจริงไว้ด้วย", r.day_notes.some((n) => n.includes("วันว่างเร็วสุดจริงคือ") && n.includes(D1)));
  ok("③ day_plan มีคิวเดิมพร้อมระยะ", r.day_plan.length === 1 && r.day_plan[0].km != null);
}

// ④ คิวใกล้กันอยู่ไกลเกินช่วงมองต่อ (เกิน 3 วันจากวันว่างเร็วสุด) → ไม่รอ เสนอวันว่างเร็วสุด
{
  const far = isoOf(addDays(12));
  const farOk = new Date(far + "T00:00:00Z").getUTCDay() === 0 ? isoOf(addDays(13)) : far;
  const ents = [entry("near", MAC, farOk, "10:00", NEAR_BBT)];
  const r = await run(ents, { ...BANGBUATHONG, address: "บางบัวทอง นนทบุรี" });
  ok("④ คิวใกล้อยู่อีก 12 วัน → ไม่รอ ได้วันแรก", r.queue_date === D1, JSON.stringify([r.queue_date, r.reason]));
}

// ⑤ วันเดียวกัน เซลล์ 2 คน: คนงานน้อยกว่าว่างทั้งวัน อีกคนมีคิวใกล้ → เลือกคนที่มีคิวใกล้
{
  const ents = [entry("near", MAC, D1, "10:00", NEAR_BBT), entry("x1", MAC, D3, "10:00", SATHORN)];
  const r = await run(ents, { ...BANGBUATHONG, address: "บางบัวทอง นนทบุรี" });
  ok("⑤ วันเดียวกัน → เลือกแม็ก (มีคิวใกล้) บ่าย", r.queue_date === D1 && r.sales_name === "แม็ก" && r.queue_time === "14:00", JSON.stringify([r.queue_date, r.sales_name, r.queue_time]));
  ok("⑤ บอกว่าไล้ก็ว่าง", r.day_notes.some((n) => n.includes("ไล้ ก็ว่างวันนี้")));
}

// ⑥ คิวเดิมไม่มีพิกัด มีแต่ที่อยู่ → หาพิกัดประมาณแล้วจับคู่ได้ (เคสคุณศาริณีลงแต่ที่อยู่)
{
  globalThis.__geo = (a) => (String(a).includes("ใกล้บางบัวทอง") ? { ...NEAR_BBT, label: "ทดสอบ", approx: true } : null);
  const ents = [entry("l1", LAI, D1, "10:00", SATHORN), entry("l2", LAI, D1, "14:00", SATHORN), entry("noco", MAC, D1, "10:00", null, { address: "ใกล้บางบัวทอง" })];
  const r = await run(ents, { ...BANGBUATHONG, address: "บางบัวทอง นนทบุรี" });
  ok("⑥ คิวเดิมมีแต่ที่อยู่ → จับคู่ได้", r.queue_date === D1 && r.sales_name === "แม็ก" && r.queue_time === "14:00", JSON.stringify([r.queue_date, r.sales_name, r.reason]));
  ok("⑥ บอกว่าพิกัดคิวเดิมเป็นค่าประมาณ", r.reason.includes("ประมาณจากที่อยู่"));
  // หาพิกัดไม่เจอ → ไม่จับคู่ (ไม่เดา)
  const ents2 = [entry("l1", LAI, D1, "10:00", SATHORN), entry("l2", LAI, D1, "14:00", SATHORN), entry("noco", MAC, D1, "10:00", null, { address: "ไม่รู้จัก" })];
  const r2 = await run(ents2, { ...BANGBUATHONG, address: "บางบัวทอง นนทบุรี" });
  ok("⑥ หาพิกัดคิวเดิมไม่เจอ → ไม่จับคู่วันนั้น", r2.queue_date === D2, JSON.stringify([r2.queue_date, r2.reason]));
  globalThis.__geo = () => null;
}

// ⑦ เคสที่เจ้าของเคยเคาะ — ต้องคงเดิม
{
  // นนทบุรี → สาทร 11 กม. ORS 30 นาที → ห้ามจับคู่
  globalThis.__ors = () => 30;
  const ents = [entry("sat", LAI, D1, "10:00", SATHORN), entry("m", MAC, D1, "10:00", SATHORN), entry("m2", MAC, D1, "14:00", SATHORN)];
  const r = await run(ents, { ...NONTHABURI, address: "เมืองนนทบุรี" });
  ok("⑦ นนทบุรี→สาทร 11 กม. ขับ 30 นาที → ไม่จับคู่", r.queue_date !== D1, JSON.stringify([r.queue_date, r.reason]));
  ok("⑦ บอกเหตุที่ไม่จับคู่พร้อมตัวเลข", r.day_notes.some((n) => n.includes("มีคิวใกล้ ๆ") && n.includes("กม.") && n.includes("นาที")), JSON.stringify(r.day_notes));
  // รามคำแหง 24 → ร่มเกล้า 12 กม. ORS 16 นาที → ต้องจับคู่
  globalThis.__ors = () => 16;
  const ents2 = [entry("ram", LAI, D1, "10:00", RAM24), entry("m", MAC, D1, "10:00", SATHORN), entry("m2", MAC, D1, "14:00", SATHORN)];
  const r2 = await run(ents2, { ...ROMKLAO, address: "ร่มเกล้า กรุงเทพ" });
  ok("⑦ ราม 24→ร่มเกล้า 12 กม. ขับ 16 นาที → จับคู่", r2.queue_date === D1 && r2.sales_name === "ไล้" && r2.queue_time === "14:00", JSON.stringify([r2.queue_date, r2.reason]));
  // เกิน 16 กม. → ไม่จับคู่แม้ถนนเร็ว
  globalThis.__ors = () => 10;
  const ents3 = [entry("far", LAI, D1, "10:00", { lat: 13.60, lng: 100.75 }), entry("m", MAC, D1, "10:00", SATHORN), entry("m2", MAC, D1, "14:00", SATHORN)];
  const r3 = await run(ents3, { ...BANGBUATHONG, address: "บางบัวทอง" });
  ok("⑦ ห่างเกิน 16 กม. → ไม่จับคู่", r3.queue_date !== D1);
}

// ⑧ ช่องครึ่งวัน: คิวเดิม 09:30 กันช่องเช้า · 15:00 กันช่องบ่าย (บั๊ก 3 พ.ย.69 ห้ามกลับมา)
setOrs(1.5);
{
  const ents = [entry("a", LAI, D1, "09:30", NEAR_BBT), entry("b", LAI, D1, "15:00", NEAR_BBT)];
  const r = await run(ents, { ...BANGBUATHONG, address: "บางบัวทอง" }, [LAI]);
  ok("⑧ เต็ม 2 ครึ่งวัน (09:30 + 15:00) → ไม่เสนอวันนั้น", r.queue_date !== D1, JSON.stringify([r.queue_date, r.queue_time]));
}

// ⑨ exclude_id: แก้คิวเดิมแล้วกดเสนอ → ไม่นับตัวเอง
{
  const ents = [entry("self", LAI, D1, "10:00", BANGBUATHONG)];
  const r = await run(ents, { ...BANGBUATHONG, address: "บางบัวทอง", exclude_id: "self" }, [LAI]);
  ok("⑨ exclude_id → ได้ช่องเช้าวันเดิม ไม่จับคู่กับตัวเอง", r.queue_date === D1 && r.queue_time === "10:00" && r.day_plan.length === 0, JSON.stringify([r.queue_date, r.queue_time, r.reason]));
}

// ⑩ ล็อกเวลา / งานหลายจุด / เต็มวัน ยังทำงานตามเดิม
{
  const r = await run([], { ...BANGBUATHONG, address: "บางบัวทอง", fixed_time: "14:00" });
  ok("⑩ ล็อกเวลา 14:00", r.queue_time === "14:00");
  const r2 = await run([], { ...BANGBUATHONG, address: "บางบัวทอง", job_size: "MULTI" });
  ok("⑩ งานหลายจุด → บ่ายก่อน", r2.queue_time === "14:00");
  const r3 = await run([entry("a", LAI, D1, "10:00", NEAR_BBT), entry("b", MAC, D1, "14:00", NEAR_BBT)], { ...BANGBUATHONG, address: "บางบัวทอง", job_size: "FULLDAY" });
  ok("⑩ เต็มวัน → ต้องว่างทั้งวัน", r3.queue_date === D2 && r3.queue_time === "10:00", JSON.stringify([r3.queue_date]));
}

// ⑪ เคสจริง 16 พ.ย.69: บางบัวทอง (ปองพล) ↔ ศาลากลาง บางกรวย (ศาริณี) 14.8 กม. — เจ้าของถือว่า "ใกล้กัน" ต้องลงวันเดียวกันได้
{
  const km = haversineKm(BANGBUATHONG, SALAKLANG);
  ok("⑪ ระยะเส้นตรง ~14.8 กม.", Math.abs(km - 14.8) < 0.3, String(km));
  globalThis.__ors = () => globalThis.__case11Ors;
  globalThis.__geo = (a) => (String(a).includes("ศาลากลาง") ? { ...SALAKLANG, label: "ศาลากลาง", approx: true } : null);
  globalThis.__case11Ors = Number(process.env.CASE11_ORS || 25);
  const ents = [
    entry("l1", LAI, D1, "10:00", SATHORN), entry("l2", LAI, D1, "14:00", SATHORN),
    entry("sarinee", MAC, D2, "10:00", null, { address: "ถนนสำเร็จพัฒนา ตำบลศาลากลาง อำเภอบางกรวย นนทบุรี" }),
    entry("m1", MAC, D1, "10:00", SATHORN), entry("m1b", MAC, D1, "14:00", SATHORN),
  ];
  const r = await run(ents, { ...BANGBUATHONG, address: "บางบัวทอง นนทบุรี" });
  ok("⑪ ปองพล → ลงวันเดียวกับศาริณี (บ่าย แม็ก)", r.queue_date === D2 && r.sales_name === "แม็ก" && r.queue_time === "14:00", JSON.stringify([r.queue_date, r.sales_name, r.queue_time, r.reason, r.day_notes]));
  ok("⑪ reason บอกชานเมือง ถนนเร็ว", r.reason.includes("ชานเมือง"), r.reason);
  // ชานเมืองแต่ขับนานจริง (ORS 40 นาที ×1.2 = 48 > 45) → ไม่จับคู่
  globalThis.__case11Ors = 40;
  const r2 = await run(ents, { ...BANGBUATHONG, address: "บางบัวทอง นนทบุรี" });
  ok("⑪ ชานเมืองแต่ขับ 40 นาที → ไม่จับคู่", !(r2.queue_date === D2 && r2.sales_name === "แม็ก"), JSON.stringify([r2.queue_date, r2.sales_name]));
  globalThis.__geo = () => null;
}

// ⑫ ในเมือง ระยะเท่ากัน (11 กม.) ขับ 25 นาที → ยังไม่จับคู่ (25×1.5 = 37.5 > 30) — กติกาในเมืองไม่ถูกผ่อน
{
  globalThis.__ors = () => 25;
  const ents = [entry("sat", LAI, D1, "10:00", SATHORN), entry("m", MAC, D1, "10:00", SATHORN), entry("m2", MAC, D1, "14:00", SATHORN)];
  const r = await run(ents, { ...NONTHABURI, address: "เมืองนนทบุรี" });
  ok("⑫ ในเมือง 11 กม. ขับ 25 นาที → ไม่จับคู่", r.queue_date !== D1, JSON.stringify([r.queue_date, r.reason]));
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\nverify-queue-suggest: ผ่าน ${pass} · ไม่ผ่าน ${fail}`);
process.exit(fail ? 1 : 0);
