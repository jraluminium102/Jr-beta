/**
 * verify-room-desc — ข้อความรายด้านของห้องกระจก (G6) ที่ไปขึ้นใบเสนอราคา
 * รัน:  node --experimental-strip-types scripts/verify-room-desc.mjs
 *
 * รูปแบบที่เจ้าของเคาะ (7 ส.ค.69 · ส่งแบบ + ตัวอย่างบรรทัดมาให้):
 *   ด้าน A ประตูบานเลื่อน + บานเปิด (Parallel Casement Door) (มีธรณีกันน้ำ) (มีมุ้งจีบ)
 *          พร้อมกระจกติดตายด้านบน (ขนาด 1.29×3.20 ม.) (ราคา 39,800฿)
 * กติกา: ไม่มี ":" หลังชื่อด้าน · คุณสมบัติแยกวงเล็บทีละอย่าง · ไม่มีชนิดกระจก ·
 *        ไม่มีขนาดรายบาน (ใช้ขนาดรวมของด้าน ทศนิยม 2 ตำแหน่ง) · กระจกติดตายท้ายสุด + บอกตำแหน่ง
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sideDescQuote, paneUse, paneUseOf, paneSill, sideSize, quoteProductName, isFixedPane, sillIsForm } from "../src/lib/calculator40/room-desc.ts";

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

console.log("\n═══ ① บรรทัดตัวอย่างที่เจ้าของเขียนมาเอง — ต้องออกมาเหมือนเป๊ะ ═══");
{
  // ตรงตามแบบที่ส่งมา: ช่องเดียว ซ้อน 2 บาน — ติดตาย 1.29×0.60 ด้านบน + PC Door 1.29×2.60 + มุ้งจีบ
  //   ขนาดรวมของด้าน = 1.29 × (0.60+2.60) = 1.29×3.20 ม.
  const s = glassSide([
    pane({ typeKey: "fixed", w: 1.29, h: 0.6 }),
    pane({ typeKey: "pcdoor", form: "แบ่ง 2", w: 1.29, h: 2.6, addons: { mosquito: "pleat" } }),
  ]);
  eq(
    "บรรทัดเต็ม (ด้าน A)",
    `- ด้าน A ${sideDescQuote(s)} (ราคา 39,800฿)`,
    "- ด้าน A ประตูบานเลื่อน + บานเปิด (Parallel Casement Door) (มีธรณีกันน้ำ) (มีมุ้งจีบ) พร้อมกระจกติดตายด้านบน (ขนาด 1.29×3.20 ม.) (ราคา 39,800฿)",
  );
  const t = sideDescQuote(s);
  ok("ไม่มีชนิดกระจกในบรรทัด", !/กระจกเขียว|กระจกใส|เทมเปอร์/.test(t), t);
  ok("ไม่มีขนาดรายบาน (มีแค่ขนาดรวมท้ายเดียว)", (t.match(/ขนาด /g) || []).length === 1, t);
  ok("รูปแบบที่เป็นค่ามาตรฐาน (แบ่ง 2) ไม่ต้องขึ้นใบ", !t.includes("แบ่ง 2"), t);
}

console.log("\n═══ ①b ตำแหน่งกระจกติดตาย (บน / ล่าง / ข้าง) ═══");
{
  const above = glassSide([pane({ typeKey: "fixed", w: 1, h: 0.6 }), pane({ typeKey: "pcdoor", w: 1, h: 2.6 })]);
  ok("ติดตายอยู่เหนือประตู → ด้านบน", sideDescQuote(above).includes("กระจกติดตายด้านบน"), sideDescQuote(above));
  const below = glassSide([pane({ typeKey: "pcdoor", w: 1, h: 2.6 }), pane({ typeKey: "fixed", w: 1, h: 0.6 })]);
  ok("ติดตายอยู่ใต้ประตู → ด้านล่าง", sideDescQuote(below).includes("กระจกติดตายด้านล่าง"), sideDescQuote(below));
  const beside = glassSide([pane({ typeKey: "pcdoor", w: 1, h: 2.6 })], [pane({ typeKey: "fixed", w: 0.8, h: 2.6 })]);
  ok("ติดตายอยู่คนละช่อง → ด้านข้าง", sideDescQuote(beside).includes("กระจกติดตายด้านข้าง"), sideDescQuote(beside));
  const only = glassSide([pane({ typeKey: "fixed", w: 1, h: 2.6 })]);
  ok("ด้านติดตายล้วน → ไม่บอกตำแหน่ง", /^กระจกติดตาย \(ขนาด/.test(sideDescQuote(only)), sideDescQuote(only));
}

console.log("\n═══ ①c ด้านเดียวมีทั้งประตู หน้าต่าง และติดตาย — ประตูต้องมาก่อนเสมอ ═══");
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
  ok("มุ้งอยู่ในวงเล็บ", t.includes("(มีมุ้งจีบ)"), t);
  console.log(`     → ${t}`);
}

console.log("\n═══ ③ ค่าตั้งต้น ประตู/หน้าต่าง — ตามชนิดรุ่นเท่านั้น ห้ามดูขนาด ═══");
{
  // ⚠ กฎเหล็ก (เจ้าของสั่ง 7 ส.ค.69): "ไม่เดาประตูหน้าต่างผ่านขนาด หน้าต่างบางอันสูง"
  //    เปลี่ยนความสูงยังไงผลต้องเท่าเดิมเป๊ะ
  for (const [id, want] of [["sms_slide", "door"], ["euro_slide", "door"], ["open_door", "door"], ["pcdoor", "door"],
    ["awning", "window"], ["banklet", "window"], ["banyok", "window"], ["fold_lift", "window"]]) {
    const hs = [0.4, 1.2, 2.2, 3.5].map((h) => paneUse(pane({ typeKey: id, h })));
    ok(`${id}: สูง 0.4/1.2/2.2/3.5 ม. ได้ผลเดียวกันหมด = ${want}`, hs.every((x) => x === want), hs.join(","));
  }
  ok("ฟังก์ชันไม่รับขนาดเลย (paneUseOf มี 2 อาร์กิวเมนต์)", paneUseOf.length === 2, String(paneUseOf.length));
  eq("บานติดตาย = ติดตายเสมอ", paneUse(pane({ typeKey: "fixed", h: 2.4 })), "fixed");
  eq("ผู้ใช้เลือก 'หน้าต่าง' ต้องชนะค่าตั้งต้น", paneUse(pane({ typeKey: "sms_slide", h: 2.4, use: "window" })), "window");
  eq("ผู้ใช้เลือก 'ประตู' ต้องชนะค่าตั้งต้น", paneUse(pane({ typeKey: "awning", h: 0.5, use: "door" })), "door");
  eq("บานติดตาย: เลือก use ไม่มีผล (ยังติดตาย)", paneUse(pane({ typeKey: "fixed", h: 2.4, use: "door" })), "fixed");
  eq("บานเลื่อน → พื้นล่างตั้งต้น", paneSill(pane({ typeKey: "sms_slide" })), "มีรางล่าง");
  eq("บานเปิด → พื้นล่างตั้งต้น", paneSill(pane({ typeKey: "open_door" })), "มีธรณีกันน้ำ");
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
  eq("ผนังเล็กกว่าบานที่เจาะ → ครอบบาน (สูง)",
    sideSize({ kind: "wall", aw: 1.19, ah: 0.6, cols: [{ pcs: [pane({ typeKey: "pcdoor", w: 1.19, h: 2.6 })] }] }).h, 2.6);
}

console.log("\n═══ ⑤ ด้านผนัง / เปิดโล่ง ═══");
{
  const w = sideDescQuote({ kind: "wall", wallType: "smartboard", aw: 4.61, ah: 3, cols: [] }, "สมาร์ทบอร์ด 12มม. (R4.0)");
  eq("ผนังล้วน", w, "สมาร์ทบอร์ด 12มม. (R4.0) (ขนาด 4.61×3.00 ม.)");
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
  ok("ราคาขึ้นว่า (ราคา …฿)", /\(ราคา \$\{baht\(s\)\}฿\)/.test(c), "");
  const r = fs.readFileSync(path.join(ROOT, "src/components/calculator40/RoomComposer.tsx"), "utf8");
  ok("RoomComposer ใช้ sideDescQuote จากโมดูลกลาง", /from "@\/lib\/calculator40\/room-desc"/.test(r) && /sideDescQuote\(s, wallLabel\)/.test(r), "");
  ok("ไม่เหลือ paneDesc ตัวเก่าในคอมโพเนนต์ (กันสองแหล่ง)", !/function paneDesc\(/.test(r), "");
  ok("มีตัวเลือก ประตู/หน้าต่าง ในหน้าจอ", /onPatchPane\(sel\.key, \{ use: e\.target\.value/.test(r), "");
  ok("มีตัวเลือกพื้นล่าง (เฉพาะประตู)", /paneUse\(sel\) === "door"[\s\S]{0,200}sill: e\.target\.value/.test(r), "");
}

console.log("\n═══ ⑦ ประตู/หน้าต่าง ในหน้าคิดราคาปกติ (ทุกชุดที่เป็นบาน ไม่ใช่แค่ห้องกระจก) ═══");
{
  const q = (id, use, base) => quoteProductName(id, use, base);
  // ⚠ sms_slide มี saleName ฝัง "ประตู" ไว้ตายตัว — เลือกหน้าต่างต้องเปลี่ยนคำได้จริง
  eq("saleName ฝัง 'ประตู' → เลือกหน้าต่างต้องเปลี่ยนตาม",
    q("sms_slide", "window", "ประตูบานเลื่อนอิสระ รางล่าง (รุ่นกันน้ำ)"), "หน้าต่างบานเลื่อนอิสระ รางล่าง (รุ่นกันน้ำ)");
  eq("เลือกประตู → คงคำเดิม ไม่ซ้อน 'ประตูประตู'",
    q("sms_slide", "door", "ประตูบานเลื่อนอิสระ รางล่าง (รุ่นกันน้ำ)"), "ประตูบานเลื่อนอิสระ รางล่าง (รุ่นกันน้ำ)");
  eq("pcdoor ใช้ชื่อเต็มบนใบ", q("pcdoor", "door", "ประตูบานเปิด PC Door"), "ประตูบานเลื่อน + บานเปิด (Parallel Casement Door)");
  eq("velora เปลี่ยนคำให้อ่านออก (ไม่ใช่ 'ประตูVelora บานเปิด')", q("velora", "door", "Velora บานเปิด"), "ประตูบานเปิด Velora");
  eq("บานกระทุ้งเลือกหน้าต่าง", q("awning", "window", "บานกระทุ้ง"), "หน้าต่างบานกระทุ้ง");
  eq("ชุดพิเศษไม่เติมคำนำหน้า (Shower)", q("shower", "door", "ห้องอาบน้ำ Shower"), "ห้องอาบน้ำ Shower");
  ok("บานติดตายไม่ต้องมีตัวเลือก", isFixedPane("fixed") && isFixedPane("curve_fixed"), "");
  ok("รุ่นที่รูปแบบ = ธรณี ไม่ต้องมีช่องพื้นล่างซ้ำ", ["open_door", "pivot", "bansolid"].every(sillIsForm), "");
  ok("บานเลื่อนไม่เข้าข่ายนั้น (ต้องมีช่องพื้นล่าง)", !sillIsForm("sms_slide") && !sillIsForm("topslide"), "");

  const c = fs.readFileSync(path.join(ROOT, "src/components/Calculator40Client.tsx"), "utf8");
  ok("หน้าคิดราคามีตัวเลือก ประตู/หน้าต่าง", /label=\{`ประตู\/หน้าต่าง/.test(c), "");
  ok("หน้าคิดราคามีตัวเลือกพื้นล่าง (เฉพาะประตู · เว้นรุ่นที่รูปแบบเป็นธรณี)",
    /paneKind === "door" && !sillIsForm\(prod\.id\) && \(/.test(c), "");
  ok("ชื่อรายการใช้ quoteProductName (ไม่เขียนคำเอง)", /quoteProductName\(prod\.id, paneKind, baseName\)/.test(c), "");
  ok("โชว์เฉพาะกลุ่มบาน G1 ที่ไม่ใช่ติดตาย/ชุดพิเศษ",
    /prod\.group === 1 && !prod\.composite && !isFixedPane\(prod\.id\) && !noKindPrefix\(prod\.id\)/.test(c), "");
  ok("เก็บลงสูตรข้อ (กลับมาแก้ได้)", /profit, profitProd, profitInst, laborMode, useSel, sillSel,/.test(c), "");
  ok("โหลดสูตรเก่าคืนค่า (ใบเก่า = ให้ระบบเดา)", /setUseSel\(r\.useSel === "door"/.test(c), "");
  ok("เปลี่ยนรุ่นแล้วรีเซ็ตกลับเป็นอัตโนมัติ", /setUseSel\("auto"\); setSillSel\(""\);/.test(c), "");
}

console.log(`\n═══ สรุป: ✅ ${pass} ผ่าน · ❌ ${fail} ไม่ผ่าน ═══`);
process.exit(fail ? 1 : 0);
