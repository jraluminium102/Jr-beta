/**
 * verify-room-desc — ข้อความรายด้านของห้องกระจก (G6) ที่ไปขึ้นใบเสนอราคา
 * รัน:  node --experimental-strip-types scripts/verify-room-desc.mjs
 *
 * รูปแบบที่เจ้าของเคาะ 7 ส.ค.69:
 *   ประตู/หน้าต่างก่อน → พื้นล่าง (ถ้าเป็นประตู) → มุ้ง → กระจกติดตายท้ายสุด → ขนาดรวมของด้าน
 *   ห้ามมี ":" หลังชื่อด้าน · ห้ามมีชนิดกระจก · ห้ามมีขนาดรายบาน
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sideDescQuote, paneUse, paneSill, sideSize } from "../src/lib/calculator40/room-desc.ts";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const okk = got === want;
  okk ? pass++ : fail++;
  console.log(`${okk ? "✅" : "❌"} ${name}${okk ? `\n     ${got}` : `\n     ได้  : ${got}\n     คาด : ${want}`}`);
};
const ok = (name, cond, extra = "") => { cond ? pass++ : fail++; console.log(`${cond ? "✅" : "❌"} ${name}${cond ? "" : "  " + extra}`); };

const pane = (o) => ({ typeKey: "open_door", w: 1, h: 2.2, n: 1, addons: {}, ...o });
const glassSide = (...cols) => ({ kind: "glass", cols: cols.map((pcs) => ({ pcs })) });

console.log("\n═══ ① ลำดับ: ประตู → มุ้ง → กระจกติดตาย → ขนาดรวม ═══");
{
  // เคสจริงจากหน้าจอเจ้าของ (ด้าน A): ช่องเดียว ซ้อน 2 บาน — ติดตาย 1.29×0.6 บน + PC Door 1.29×2.6 ล่าง
  //   ขนาดรวมของด้านจึงเป็น 1.29 × (0.6+2.6) = 1.29×3.2 ม.
  const s = glassSide([
    pane({ typeKey: "fixed", w: 1.29, h: 0.6 }),
    pane({ typeKey: "pcdoor", form: "แบ่ง 2", w: 1.29, h: 2.6, addons: { mosquito: "pleat" } }),
  ]);
  const t = sideDescQuote(s);
  ok("ขึ้นต้นด้วยประตู (ไม่ใช่บานติดตาย)", t.startsWith("ประตู"), t);
  ok("มีพื้นล่างของประตู", /มีธรณี|ไม่มีธรณี|รางล่าง/.test(t), t);
  ok("มุ้งอยู่หลังพื้นล่าง", t.indexOf("มีธรณี") < t.indexOf("มุ้ง"), t);
  ok("กระจกติดตายอยู่ท้าย (ก่อนขนาด)", /และกระจกติดตาย \d/.test(t), t);
  ok("ไม่มีชนิดกระจกในบรรทัด", !/กระจกเขียว|กระจกใส|เทมเปอร์/.test(t), t);
  ok("ขนาดรวมของด้าน (กว้างรวม × สูงรวม)", t.endsWith("1.29×3.2 ม."), t);
  console.log(`     → ${t}`);
}

console.log("\n═══ ①b ด้านเดียวมีทั้งประตู หน้าต่าง และติดตาย — ประตูต้องมาก่อนเสมอ ═══");
{
  // จงใจใส่เรียง ติดตาย → หน้าต่าง → ประตู เพื่อพิสูจน์ว่าโค้ดจัดลำดับใหม่ให้จริง (ไม่ใช่บังเอิญตามที่กรอก)
  const s = glassSide(
    [pane({ typeKey: "fixed", w: 0.8, h: 2.4 })],
    [pane({ typeKey: "awning", w: 1.0, h: 0.9 })],
    [pane({ typeKey: "pcdoor", form: "แบ่ง 2", w: 1.2, h: 2.4 })],
  );
  const t = sideDescQuote(s);
  const iDoor = t.indexOf("ประตู"), iWin = t.indexOf("หน้าต่าง"), iFix = t.indexOf("กระจกติดตาย");
  ok("ประตูมาก่อนหน้าต่าง", iDoor >= 0 && iWin > iDoor, t);
  ok("หน้าต่างมาก่อนกระจกติดตาย", iWin >= 0 && iFix > iWin, t);
  console.log(`     → ${t}`);
}

console.log("\n═══ ② หน้าต่าง (ไม่มีพื้นล่าง) ═══");
{
  const s = glassSide([pane({ typeKey: "awning", w: 1.2, h: 0.8, addons: { mosquito: "pleat" } })]);
  const t = sideDescQuote(s);
  ok("ขึ้นต้นด้วย หน้าต่าง", t.startsWith("หน้าต่าง"), t);
  ok("หน้าต่างไม่มีคำว่าธรณี/รางล่าง", !/ธรณี|รางล่าง/.test(t), t);
  ok("มีมุ้ง", /มุ้งจีบ/.test(t), t);
  console.log(`     → ${t}`);
}

console.log("\n═══ ③ เดาประตู/หน้าต่างเมื่อผู้ใช้ยังไม่เลือก + เลือกเองแล้วต้องชนะ ═══");
{
  eq("บานเลื่อนสูง 2.2ม. = ประตู", paneUse(pane({ typeKey: "sms_slide", h: 2.2 })), "door");
  eq("บานเลื่อนสูง 1.2ม. = หน้าต่าง", paneUse(pane({ typeKey: "sms_slide", h: 1.2 })), "window");
  eq("PC Door = ประตูเสมอ (แม้เตี้ย)", paneUse(pane({ typeKey: "pcdoor", h: 1.0 })), "door");
  eq("บานติดตาย = ติดตายเสมอ", paneUse(pane({ typeKey: "fixed", h: 2.4 })), "fixed");
  eq("ผู้ใช้เลือก 'หน้าต่าง' ต้องชนะการเดา", paneUse(pane({ typeKey: "sms_slide", h: 2.4, use: "window" })), "window");
  eq("บานติดตาย: เลือก use ไม่มีผล (ยังติดตาย)", paneUse(pane({ typeKey: "fixed", h: 2.4, use: "door" })), "fixed");
  eq("บานเลื่อน → พื้นล่างตั้งต้น = รางล่าง", paneSill(pane({ typeKey: "sms_slide" })), "รางล่าง");
  eq("บานเปิด → พื้นล่างตั้งต้น = มีธรณี", paneSill(pane({ typeKey: "open_door" })), "มีธรณี");
  eq("ผู้ใช้เลือกพื้นล่างเองต้องชนะ", paneSill(pane({ typeKey: "sms_slide", sill: "ไม่มีธรณี" })), "ไม่มีธรณี");
}

console.log("\n═══ ④ ขนาดรวมของด้าน ═══");
{
  // 2 ช่อง กว้าง 1.5 + 1.2 · ช่องแรกซ้อน 2 บาน สูง 0.6+2.0 = 2.6 · ช่องสอง 2.2
  const s = glassSide(
    [pane({ typeKey: "fixed", w: 1.5, h: 0.6 }), pane({ typeKey: "open_door", w: 1.5, h: 2.0 })],
    [pane({ typeKey: "awning", w: 1.2, h: 2.2 })],
  );
  const sz = sideSize(s);
  eq("กว้างรวม = 1.5 + 1.2", sz.w, 2.7);
  eq("สูงรวม = สูงสุดของช่อง (0.6+2.0)", sz.h, 2.6);
  ok("ด้านผนังใช้ขนาดผนัง", sideSize({ kind: "wall", aw: 4.61, ah: 3 }).w === 4.61, "");
  // เคสจริง ด้าน C: ผนังกรอกไว้ 1.19×0.6 แต่ประตูที่เจาะสูง 2.6 → ขนาดด้านต้องครอบประตู
  {
    const sz = sideSize({ kind: "wall", aw: 1.19, ah: 0.6, cols: [{ pcs: [pane({ typeKey: "pcdoor", w: 1.19, h: 2.6 })] }] });
    eq("ผนังเล็กกว่าบานที่เจาะ → ครอบบาน (สูง)", sz.h, 2.6);
  }
}

console.log("\n═══ ⑤ ด้านผนัง / เปิดโล่ง ═══");
{
  const w = sideDescQuote({ kind: "wall", wallType: "smartboard", aw: 4.61, ah: 3, cols: [] }, "สมาร์ทบอร์ด 12มม. (R4.0)");
  ok("ผนังขึ้นชื่อผนังก่อน + ขนาดรวมท้าย", w === "สมาร์ทบอร์ด 12มม. (R4.0) 4.61×3 ม.", w);
  const wd = sideDescQuote(
    { kind: "wall", wallType: "smartboard", aw: 1.19, ah: 2.6, cols: [{ pcs: [pane({ typeKey: "pcdoor", form: "แบ่ง 2", w: 1.19, h: 2.6, addons: { mosquito: "pleat" } })] }] },
    "ผนังสมาร์ทบอร์ด",
  );
  ok("ผนังที่มีประตูเจาะ — ผนังก่อน แล้วประตู", wd.startsWith("ผนังสมาร์ทบอร์ด + ประตู"), wd);
  console.log(`     → ${wd}`);
  eq("ด้านเปิดโล่งไม่มีบาน", sideDescQuote({ kind: "open", cols: [] }), "เปิดโล่ง");
}

console.log("\n═══ ⑥ สายไฟ — ต้องไม่มี ':' หลังชื่อด้าน + ใช้โมดูลกลาง ═══");
{
  const c = fs.readFileSync(path.join(ROOT, "src/components/Calculator40Client.tsx"), "utf8");
  ok("ไม่มี ':' หลังชื่อด้าน", /`- ด้าน \$\{String\.fromCharCode\(65 \+ i\)\} \$\{dd\[i\]/.test(c), "");
  const r = fs.readFileSync(path.join(ROOT, "src/components/calculator40/RoomComposer.tsx"), "utf8");
  ok("RoomComposer ใช้ sideDescQuote จากโมดูลกลาง", /from "@\/lib\/calculator40\/room-desc"/.test(r) && /sideDescQuote\(s, wallLabel\)/.test(r), "");
  ok("ไม่เหลือ paneDesc ตัวเก่าในคอมโพเนนต์ (กันสองแหล่ง)", !/function paneDesc\(/.test(r), "");
  ok("มีตัวเลือก ประตู/หน้าต่าง ในหน้าจอ", /onPatchPane\(sel\.key, \{ use: e\.target\.value/.test(r), "");
  ok("มีตัวเลือกพื้นล่าง (เฉพาะประตู)", /paneUse\(sel\) === "door"[\s\S]{0,200}sill: e\.target\.value/.test(r), "");
}

console.log(`\n═══ สรุป: ✅ ${pass} ผ่าน · ❌ ${fail} ไม่ผ่าน ═══`);
process.exit(fail ? 1 : 0);
