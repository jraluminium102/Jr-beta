/**
 * ใบเบิกอลู — ตรรกะกลาง (ช่างผ่านลิงก์ + สโตร์ล็อกอิน ใช้ตัวเดียวกัน)
 *
 * กติกา (เจ้าของเคาะ 19 ต.ค.69):
 *   · บันทึกแล้ว "ตัดสต็อกทันที" = stock_moves out (ref PK-id · requester = ชื่อช่าง · job_id) · trigger ปรับ qty_on_hand
 *   · แก้จำนวน / คืนเส้น / ยกเลิกทั้งใบ ลงเป็น move เพิ่ม (ไม่ลบของเดิม) → สมุดสโตร์เห็นประวัติครบว่าใครแก้
 *   · ช่างแก้ได้เองจนกว่าสโตร์กด "ตรวจแล้ว" (status checked) หลังจากนั้นสโตร์แก้ให้
 *
 * ⚠ ยอดจริง = stock_moves เท่านั้น · alu_pick_items.qty/returned เป็นสำเนาไว้โชว์/แก้เป็นใบ
 * ⚠ สต็อกห้ามติดลบ (0074 check) — เช็คคงเหลือก่อนทุกครั้ง แล้วบอกเป็นภาษาคนว่าเส้นไหนไม่พอ
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { pickGroupOf } from "./classify";
export type Sb = { from: (t: string) => any };

export type PickActor = { userId: string | null; name: string; isChang: boolean };

export type PickItemIn = { stock_item_id: number; qty: number };

export class PickError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

type ItemRow = { id: number; sku: string; name: string; color: string | null; qty_on_hand: number; unit_cost: number | null; category: string | null; is_active: boolean; is_stocked: boolean | null };

async function loadItems(sb: Sb, ids: number[]): Promise<Map<number, ItemRow>> {
  if (!ids.length) return new Map();
  const { data, error } = await sb.from("stock_items")
    .select("id, sku, name, color, qty_on_hand, unit_cost, category, is_active, is_stocked").in("id", ids);
  if (error) throw new PickError(error.message, 500);
  return new Map(((data ?? []) as ItemRow[]).map((r) => [r.id, r]));
}

const label = (it: ItemRow) => `${it.sku ? it.sku + " " : ""}${it.name}${it.color ? " (" + it.color + ")" : ""}`;

/** ลง stock_moves 1 บรรทัด · in/out · trigger ปรับคงเหลือเอง */
async function insertMove(sb: Sb, a: PickActor, p: {
  item: ItemRow; type: "in" | "out"; qty: number; ref: string; note: string; job_id: string | null;
  /** ผู้เบิก (ช่างเจ้าของใบ) — แก้/คืน/ยกเลิก ต้องคงชื่อช่างเดิม ไม่ใช่คนที่กดแก้ (คนกดแก้อยู่ใน note + created_by) */
  requester?: string;
}) {
  const unitCost = num(p.item.unit_cost);
  const { error } = await sb.from("stock_moves").insert({
    stock_item_id: p.item.id, type: p.type, qty: r2(p.qty), ref: p.ref, note: p.note,
    requester: p.requester ?? a.name, job_id: p.job_id, unit_cost: unitCost, total_price: r2(p.qty * unitCost),
    created_by: a.userId,
  });
  if (error) {
    if (/qty_nonneg|check constraint/i.test(error.message ?? "")) {
      throw new PickError(`${label(p.item)} — ระบบมีคงเหลือไม่พอ (แจ้งสโตร์ให้ปรับยอดก่อน)`, 409);
    }
    throw new PickError(error.message, 500);
  }
}

function cleanItems(items: PickItemIn[]): PickItemIn[] {
  const m = new Map<number, number>();
  for (const it of items ?? []) {
    const id = Number(it.stock_item_id), q = r2(num(it.qty));
    if (!id || q <= 0) continue;
    m.set(id, r2((m.get(id) ?? 0) + q));
  }
  return [...m].map(([stock_item_id, qty]) => ({ stock_item_id, qty }));
}

/** สร้างใบเบิก + ตัดสต็อกทันที */
export async function createPick(sb: Sb, a: PickActor, input: {
  job_id: string | null; reason: string; reason_note: string; note: string; items: PickItemIn[];
}) {
  const items = cleanItems(input.items);
  if (!items.length) throw new PickError("ยังไม่ได้เลือกเส้น");
  if (!a.name.trim()) throw new PickError("ต้องระบุชื่อช่างที่เบิก");
  const reason = input.job_id ? "" : (input.reason === "repair" || input.reason === "other" ? input.reason : "");
  if (!input.job_id && !reason) throw new PickError("ไม่มีชื่อลูกค้า ต้องเลือกเหตุผล (งานซ่อม / อื่นๆ)");
  if (reason === "other" && !String(input.reason_note ?? "").trim()) throw new PickError("เลือก อื่นๆ ต้องระบุว่าเบิกไปทำอะไร");

  if (input.job_id) {
    const { data: job } = await sb.from("jobs").select("id, status").eq("id", input.job_id).maybeSingle();
    if (!job) throw new PickError("ไม่พบงานที่เลือก", 404);
  }

  const map = await loadItems(sb, items.map((i) => i.stock_item_id));
  const short: string[] = [];
  for (const it of items) {
    const row = map.get(it.stock_item_id);
    if (!row || !row.is_active) throw new PickError("มีเส้นที่ไม่อยู่ในสโตร์แล้ว — โหลดหน้าใหม่แล้วเลือกอีกครั้ง", 404);
    // เบิกได้เฉพาะเส้นที่หน้าเบิกโชว์ (อลู · มีบนชั้น · ไม่ใช่หลังคาอย่างเดียว) — กันยิง API ตรงเบิกของหมวดอื่น
    if (!pickGroupOf(row)) throw new PickError(`${label(row)} — ไม่ใช่เส้นอลูที่เบิกผ่านหน้านี้ได้`, 400);
    if (num(row.qty_on_hand) < it.qty) short.push(`${label(row)} เหลือ ${num(row.qty_on_hand)} ขอ ${it.qty}`);
  }
  if (short.length) throw new PickError("ระบบมีคงเหลือไม่พอ: " + short.join(" · ") + " — แจ้งสโตร์ปรับยอดก่อน หรือลดจำนวน", 409);

  const { data: head, error: hErr } = await sb.from("alu_picks").insert({
    job_id: input.job_id, reason, reason_note: String(input.reason_note ?? "").trim().slice(0, 200),
    picker_name: a.name.trim().slice(0, 60), note: String(input.note ?? "").trim().slice(0, 300),
    created_by: a.userId,
  }).select("id").single();
  if (hErr || !head) throw new PickError("บันทึกใบเบิกไม่สำเร็จ: " + (hErr?.message ?? ""), 500);
  const code = `PK-${head.id}`;
  const { error: cErr } = await sb.from("alu_picks").update({ code }).eq("id", head.id);
  if (cErr) { await sb.from("alu_picks").delete().eq("id", head.id); throw new PickError("ตั้งเลขใบเบิกไม่สำเร็จ: " + cErr.message, 500); }

  const { error: iErr } = await sb.from("alu_pick_items").insert(
    items.map((it, i) => ({ pick_id: head.id, stock_item_id: it.stock_item_id, qty: it.qty, sort_order: i })),
  );
  if (iErr) {
    await sb.from("alu_picks").delete().eq("id", head.id);
    throw new PickError("บันทึกรายการไม่สำเร็จ: " + iErr.message, 500);
  }

  // ตัดสต็อกทีละเส้น · ถ้าพลาดกลางทาง คืนของที่ตัดไปแล้ว + ลบใบ
  const done: PickItemIn[] = [];
  try {
    for (const it of items) {
      await insertMove(sb, a, { item: map.get(it.stock_item_id)!, type: "out", qty: it.qty, ref: code, note: "เบิกอลู", job_id: input.job_id });
      done.push(it);
    }
  } catch (e) {
    for (const d of done) {
      await insertMove(sb, a, { item: map.get(d.stock_item_id)!, type: "in", qty: d.qty, ref: code, note: "ยกเลิกอัตโนมัติ (บันทึกไม่ครบ)", job_id: input.job_id }).catch(() => {});
    }
    await sb.from("alu_picks").delete().eq("id", head.id);
    throw e;
  }
  return { id: head.id as number, code };
}

type PickHead = { id: number; code: string; job_id: string | null; status: string; picker_name: string };
type PickItemRow = { id: number; pick_id: number; stock_item_id: number; qty: number; returned: number };

async function loadPick(sb: Sb, id: number): Promise<{ head: PickHead; items: PickItemRow[] }> {
  const { data: head } = await sb.from("alu_picks").select("id, code, job_id, status, picker_name").eq("id", id).maybeSingle();
  if (!head) throw new PickError("ไม่พบใบเบิก", 404);
  const { data: items } = await sb.from("alu_pick_items").select("id, pick_id, stock_item_id, qty, returned").eq("pick_id", id).order("sort_order");
  return { head: head as PickHead, items: (items ?? []) as PickItemRow[] };
}

/** ช่างแก้ได้เฉพาะใบที่ยังไม่ถูกตรวจ · สโตร์/ออฟฟิศแก้ได้ตลอด (ยกเว้นใบที่ยกเลิกแล้ว) */
function assertEditable(head: PickHead, a: PickActor) {
  if (head.status === "cancelled") throw new PickError("ใบนี้ถูกยกเลิกไปแล้ว", 409);
  if (a.isChang && head.status === "checked") throw new PickError("สโตร์ตรวจใบนี้แล้ว — แก้เองไม่ได้ ให้แจ้งสโตร์", 409);
  // ช่างแก้ได้เฉพาะใบของตัวเอง (กันกดพลาดข้ามคน · ชื่อปลอมได้ระดับเดียวกับลิงก์ช่างเดิม)
  if (a.isChang && head.picker_name !== a.name) throw new PickError(`ใบนี้เป็นของ ${head.picker_name || "คนอื่น"} — แก้ได้เฉพาะใบของตัวเอง`, 403);
}
/** ตัดรายการซ้ำ (item_id เดียวกันส่งมา 2 ครั้ง) — เอาตัวสุดท้าย */
function dedupe<T extends { item_id: number }>(arr: T[]): T[] {
  const m = new Map<number, T>();
  for (const x of arr ?? []) if (Number(x.item_id)) m.set(Number(x.item_id), x);
  return [...m.values()];
}

/** แก้จำนวนเบิก (ต่อรายการ) — เพิ่ม = ตัดเพิ่ม · ลด = คืนเข้า */
export async function editPickQty(sb: Sb, a: PickActor, pickId: number, changes: { item_id: number; qty: number }[]) {
  const { head, items } = await loadPick(sb, pickId);
  assertEditable(head, a);
  const map = await loadItems(sb, items.map((i) => i.stock_item_id));
  for (const ch of dedupe(changes)) {
    const row = items.find((i) => i.id === Number(ch.item_id));
    if (!row) continue;
    // ค่าว่าง/ตัวอักษร/ติดลบ = ห้าม (ไม่งั้น NaN→0 กลายเป็นคืนทั้งใบเงียบ ๆ)
    if (ch.qty === null || ch.qty === undefined || !Number.isFinite(Number(ch.qty)) || Number(ch.qty) < 0) throw new PickError("จำนวนใหม่ต้องเป็นตัวเลข 0 ขึ้นไป");
    const newQty = r2(Number(ch.qty));
    if (newQty < num(row.returned)) throw new PickError(`แก้ให้น้อยกว่าที่คืนไปแล้ว (${num(row.returned)}) ไม่ได้`);
    const diff = r2(newQty - num(row.qty));
    if (diff === 0) continue;
    const item = map.get(row.stock_item_id);
    if (!item) continue;
    if (diff > 0 && num(item.qty_on_hand) < diff) throw new PickError(`${label(item)} — ระบบมีคงเหลือ ${num(item.qty_on_hand)} ไม่พอเพิ่มอีก ${diff}`, 409);
    // จองแถวก่อนลง move: อัปเดตได้ต่อเมื่อจำนวนยังเป็นค่าที่อ่านมา (กดซ้ำ/2 คนแก้พร้อมกัน → คนหลังโดน 409 ไม่ตัด/คืนซ้ำ)
    const { data: won, error: uErr } = await sb.from("alu_pick_items").update({ qty: newQty }).eq("id", row.id).eq("qty", row.qty).select("id");
    if (uErr) throw new PickError("บันทึกจำนวนใหม่ไม่สำเร็จ: " + uErr.message, 500);
    if (!(won ?? []).length) throw new PickError("รายการนี้เพิ่งถูกแก้โดยคนอื่น — โหลดใหม่แล้วดูอีกครั้ง", 409);
    if (diff > 0) await insertMove(sb, a, { item, type: "out", qty: diff, ref: head.code, note: `แก้จำนวน ${num(row.qty)}→${newQty} โดย ${a.name}`, job_id: head.job_id, requester: head.picker_name });
    else await insertMove(sb, a, { item, type: "in", qty: -diff, ref: head.code, note: `แก้จำนวน ${num(row.qty)}→${newQty} โดย ${a.name}`, job_id: head.job_id, requester: head.picker_name });
  }
  await sb.from("alu_picks").update({ updated_at: new Date().toISOString() }).eq("id", pickId);
}

/** คืนเส้น (บางส่วน) — ลงเป็นรับเข้า */
export async function returnPickItems(sb: Sb, a: PickActor, pickId: number, rets: { item_id: number; qty: number }[]) {
  const { head, items } = await loadPick(sb, pickId);
  assertEditable(head, a);
  const map = await loadItems(sb, items.map((i) => i.stock_item_id));
  let any = false;
  for (const rt of dedupe(rets)) {
    const row = items.find((i) => i.id === Number(rt.item_id));
    if (!Number.isFinite(Number(rt.qty))) throw new PickError("จำนวนที่คืนต้องเป็นตัวเลข");
    const q = r2(num(rt.qty));
    if (!row || q <= 0) continue;
    const left = r2(num(row.qty) - num(row.returned));
    if (q > left) throw new PickError(`คืนได้ไม่เกิน ${left} เส้น (เบิก ${num(row.qty)} คืนแล้ว ${num(row.returned)})`);
    const item = map.get(row.stock_item_id);
    if (!item) continue;
    // จองก่อนลง move (เหมือนแก้จำนวน): returned ต้องยังเป็นค่าที่อ่านมา — กดคืนซ้ำตอนเน็ตช้า จะไม่คืนเข้าสต็อก 2 รอบ
    const { data: won, error: uErr } = await sb.from("alu_pick_items").update({ returned: r2(num(row.returned) + q) }).eq("id", row.id).eq("returned", row.returned).select("id");
    if (uErr) throw new PickError("บันทึกการคืนไม่สำเร็จ: " + uErr.message, 500);
    if (!(won ?? []).length) throw new PickError("รายการนี้เพิ่งถูกคืน/แก้โดยคนอื่น — โหลดใหม่แล้วดูอีกครั้ง", 409);
    await insertMove(sb, a, { item, type: "in", qty: q, ref: head.code, note: `คืนเส้น โดย ${a.name}`, job_id: head.job_id, requester: head.picker_name });
    any = true;
  }
  if (!any) throw new PickError("ยังไม่ได้ใส่จำนวนที่คืน");
  await sb.from("alu_picks").update({ updated_at: new Date().toISOString() }).eq("id", pickId);
}

/** ยกเลิกทั้งใบ — คืนเส้นที่ยังไม่ได้คืนทั้งหมด */
export async function cancelPick(sb: Sb, a: PickActor, pickId: number, reason: string) {
  const { head, items } = await loadPick(sb, pickId);
  assertEditable(head, a);
  // claim ก่อนคืนของ: เปลี่ยนสถานะได้แค่คนเดียว (กด 2 ครั้ง/2 คนพร้อมกัน จะไม่คืนซ้ำ)
  const { data: claimed } = await sb.from("alu_picks").update({
    status: "cancelled", cancelled_at: new Date().toISOString(), cancel_reason: String(reason ?? "").slice(0, 200), cancelled_by_name: a.name,
  }).eq("id", pickId).eq("status", head.status).select("id");
  if (!(claimed ?? []).length) throw new PickError("ใบนี้เพิ่งถูกเปลี่ยนสถานะ — โหลดใหม่แล้วดูอีกครั้ง", 409);
  // อ่านรายการ "หลัง" claim — ถ้ามีคืน/แก้แทรกก่อนหน้านี้ จะคืนเฉพาะที่เหลือจริง
  const { data: fresh } = await sb.from("alu_pick_items").select("id, pick_id, stock_item_id, qty, returned").eq("pick_id", pickId).order("sort_order");
  const rows = ((fresh ?? []) as PickItemRow[]).length ? (fresh as PickItemRow[]) : items;
  const map = await loadItems(sb, rows.map((i) => i.stock_item_id));
  for (const row of rows) {
    const left = r2(num(row.qty) - num(row.returned));
    const item = map.get(row.stock_item_id);
    if (left <= 0 || !item) continue;
    const { data: won } = await sb.from("alu_pick_items").update({ returned: num(row.qty) }).eq("id", row.id).eq("returned", row.returned).select("id");
    if (!(won ?? []).length) continue;   // ถูกคืนแทรกพอดี → ข้าม (ไม่คืนซ้ำ)
    await insertMove(sb, a, { item, type: "in", qty: left, ref: head.code, note: `ยกเลิกใบเบิก โดย ${a.name}${reason ? " — " + reason : ""}`, job_id: head.job_id, requester: head.picker_name });
  }
}

/** สโตร์กด "ตรวจแล้ว" / ยกเลิกการตรวจ (เฉพาะคนล็อกอิน) */
export async function setPickChecked(sb: Sb, a: PickActor, pickId: number, checked: boolean) {
  const { head } = await loadPick(sb, pickId);
  if (head.status === "cancelled") throw new PickError("ใบนี้ถูกยกเลิกไปแล้ว", 409);
  // เปลี่ยนได้เฉพาะจากสถานะที่อ่านมา — ช่างกดยกเลิกใบแทรกพอดี จะไม่ถูกทับกลับเป็น "ตรวจแล้ว"
  const { data: won } = await sb.from("alu_picks").update(checked
    ? { status: "checked", checked_at: new Date().toISOString(), checked_by: a.userId, checked_by_name: a.name }
    : { status: "open", checked_at: null, checked_by: null, checked_by_name: "" }).eq("id", pickId).eq("status", head.status).select("id");
  if (!(won ?? []).length) throw new PickError("ใบนี้เพิ่งถูกเปลี่ยนสถานะ — โหลดใหม่แล้วดูอีกครั้ง", 409);
}
