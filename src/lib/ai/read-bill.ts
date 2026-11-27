/**
 * read-bill.ts — ให้ Claude อ่านรูปบิลซื้อ 1 หน้า → ข้อมูลใบกำกับภาษี (เจ้าของ 27 พ.ย.69)
 *
 *   รูป 1 หน้าอาจมีหลายใบ (สลิปน้ำมันสแกนรวมกัน) หรือไม่ใช่บิลเลย → คืนเป็นรายการ
 *   คืนแค่ "สิ่งที่เห็นบนกระดาษ" — การเทียบสมุดร้าน/ตัวตรวจ/เตือน อยู่ใน src/lib/purchase-tax.ts (ทดสอบได้โดยไม่ต้องเรียก AI)
 *
 * ⚠ ฝั่ง server เท่านั้น (ใช้ ANTHROPIC_API_KEY)
 */
import Anthropic from "@anthropic-ai/sdk";
import type { AiBill } from "@/lib/purchase-tax";

// lazy-init: สร้าง client ตอนเรียกใช้จริง (กัน build พังตอนยังไม่มี ANTHROPIC_API_KEY)
let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) throw new ReadBillError("ระบบยังไม่ได้ตั้งค่ากุญแจ AI (ANTHROPIC_API_KEY) — แจ้งผู้ดูแลระบบ", 503);
    // ครั้งเดียว ไม่ลองซ้ำ: ฟังก์ชันมีเวลา 60 วิ (maxDuration ของ /api/purchase-tax/read) — ลองซ้ำแล้วเกินเวลา ได้ 504 ที่ไม่ใช่ JSON และเสียค่า AI ฟรี
    _client = new Anthropic({ maxRetries: 0, timeout: 45_000 });
  }
  return _client;
}

export class ReadBillError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}

const MODEL = "claude-opus-5-5";

const SYSTEM = `คุณช่วยธุรการของบริษัท เจอาร์.อลูมิเนียมแอนด์กลาส จำกัด (เลขประจำตัวผู้เสียภาษี 0105560023352) ลงรายงานภาษีซื้อ
ผู้ใช้ส่งรูปสแกนหรือรูปถ่ายเอกสาร 1 หน้า ให้คุณอ่านใบกำกับภาษีทุกใบที่อยู่ในรูป แล้วคืนข้อมูลตามโครงที่กำหนด ธุรการจะเอาตัวเลขไปยื่นภาษีและตรวจกับกระดาษจริงอีกครั้ง

สิ่งที่สำคัญที่สุดคือความตรงกับกระดาษ: ตัวเลขทุกตัวต้องเป็นตัวที่พิมพ์อยู่บนเอกสาร ห้ามคำนวณหรือเดาเติมเอง ช่องไหนบนเอกสารไม่ได้พิมพ์ไว้ให้ใส่ null (เช่น สลิปที่มีแต่ยอดรวม ไม่แยก VAT ให้ base และ vat เป็น null) ถ้าช่องไหนอ่านไม่ออกหรือไม่แน่ใจ (เลือน ถูกตราประทับทับ ลายมือ ภาพเอียง) ให้ใส่ค่าที่อ่านได้ดีที่สุดหรือ null แล้วเขียนชื่อช่องนั้นลงใน unclear เพื่อให้ธุรการรู้ว่าต้องดูช่องไหนเป็นพิเศษ

doc_type — ชนิดเอกสาร มีผลว่าบริษัทใช้ภาษีซื้อได้หรือไม่ จึงต้องแยกให้ถูก
- "tax_invoice": ใบกำกับภาษีเต็มรูป คือมีคำว่า "ใบกำกับภาษี" และระบุชื่อกับเลขประจำตัวผู้เสียภาษีของผู้ซื้อ (รวมถึงใบเสร็จรับเงิน/ใบกำกับภาษี และใบส่งของ/ใบกำกับภาษี)
- "abbreviated_tax_invoice": ใบกำกับภาษีอย่างย่อ คือเขียนว่า "ใบกำกับภาษีอย่างย่อ" หรือเป็นสลิปเครื่องบันทึกเงินสดที่ไม่มีชื่อและเลขผู้เสียภาษีของผู้ซื้อ (สลิปปั๊มน้ำมัน ร้านสะดวกซื้อ ห้าง) ใบแบบนี้ใช้ภาษีซื้อไม่ได้
- "credit_note": ใบลดหนี้ · "debit_note": ใบเพิ่มหนี้
- "other": เอกสารที่ไม่ใช่ใบกำกับภาษี (ใบวางบิล ใบเสนอราคา ใบส่งของเปล่า สลิปโอนเงิน ใบเสร็จที่ไม่มี VAT)

ช่องอื่น ๆ
- doc_no: เลขที่ของใบกำกับใบนี้ (ไม่ใช่เลขใบสั่งซื้อ เลขใบแจ้งหนี้ที่อ้างถึง หรือรหัสลูกค้า) คัดลอกตามที่พิมพ์รวมตัวอักษรและขีด
- date: วันที่ของใบกำกับ แปลงเป็น ค.ศ. รูปแบบ YYYY-MM-DD (เอกสารไทยมักพิมพ์ปี พ.ศ. เช่น 23/05/69 หรือ 23/05/2569 คือ 2026-05-23) ไม่ใช่วันครบกำหนดหรือวันที่ลงลายมือรับเงิน
- seller_name: ชื่อผู้ขายเต็มตามที่พิมพ์ รวมคำว่า บริษัท ... จำกัด หรือ ห้างหุ้นส่วนจำกัด
- seller_tax_id: เลขประจำตัวผู้เสียภาษี 13 หลักของผู้ขาย ตัวเลขล้วน
- seller_branch: "สำนักงานใหญ่" หรือเลขสาขา 5 หลัก เช่น "00004" ตามที่พิมพ์ ถ้าไม่ระบุให้ ""
- buyer_tax_id: เลขประจำตัวผู้เสียภาษี 13 หลักของผู้ซื้อที่พิมพ์บนเอกสาร ถ้าไม่มีให้ ""
- base: มูลค่าที่นำมาคิดภาษีมูลค่าเพิ่ม คือยอดหลังหักส่วนลดและหลังหักเงินมัดจำที่ออกใบกำกับไปแล้ว (บรรทัดที่อยู่ติดกับบรรทัดภาษีมูลค่าเพิ่ม) ถ้าบิลมีสินค้ายกเว้น VAT ปนอยู่ ให้ใส่เฉพาะส่วนที่เสีย VAT แล้วเขียนใน unclear ว่ามีรายการยกเว้น VAT
- vat: ภาษีมูลค่าเพิ่ม
- total: จำนวนเงินรวมทั้งสิ้น (base + vat) ไม่ใช่ยอดหลังหักภาษี ณ ที่จ่าย และไม่ใช่ยอดคงค้างยกมา
- ใบลดหนี้และใบเพิ่มหนี้: base, vat, total คือ "ผลต่าง" ที่ลดหรือเพิ่ม ไม่ใช่มูลค่าของใบกำกับเดิมหรือมูลค่าที่ถูกต้องใหม่ ใส่เป็นตัวเลขบวก
- is_copy: true ถ้ากระดาษพิมพ์หรือประทับคำว่า "สำเนา" (ต้นฉบับหรือไม่ระบุ = false)

ถ้าในรูปมีทั้งต้นฉบับและสำเนาของใบเดียวกัน ให้คืนใบนั้นครั้งเดียว ถ้าหน้านี้เป็นหน้าต่อที่ไม่มียอดรวม หรือไม่มีเอกสารอะไรเลย ให้คืน bills เป็นรายการว่าง`;

// JSON schema ของผลลัพธ์ (structured outputs) — ต้องมี additionalProperties:false + required ครบ
const num = { anyOf: [{ type: "number" }, { type: "null" }] };
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["bills"],
  properties: {
    bills: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["doc_type", "doc_no", "date", "seller_name", "seller_tax_id", "seller_branch", "buyer_tax_id", "base", "vat", "total", "is_copy", "unclear"],
        properties: {
          doc_type: { type: "string", enum: ["tax_invoice", "abbreviated_tax_invoice", "credit_note", "debit_note", "other"] },
          doc_no: { type: "string" },
          date: { type: "string" },
          seller_name: { type: "string" },
          seller_tax_id: { type: "string" },
          seller_branch: { type: "string" },
          buyer_tax_id: { type: "string" },
          base: num, vat: num, total: num,
          is_copy: { type: "boolean" },
          unclear: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
} as const;

export type ReadBillResult = { bills: AiBill[]; usage: { input: number; output: number } };

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

export async function readBillImage(data: Buffer, mediaType: string): Promise<ReadBillResult> {
  if (!IMAGE_TYPES.includes(mediaType as ImageType)) throw new ReadBillError("รองรับเฉพาะรูป JPG / PNG / WEBP", 400);
  const client = getClient();
  let msg: Anthropic.Message;
  try {
    msg = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      system: SYSTEM,
      // งานคัดลอกตัวเลขจากภาพ ไม่ต้องคิดลึก — effort ต่ำพอ และตอบเร็วทันเวลาจำกัดของ serverless
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType as ImageType, data: data.toString("base64") } },
          { type: "text", text: "อ่านใบกำกับภาษีในรูปนี้" },
        ],
      }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK ที่ติดตั้ง (0.100) ยังไม่มี type ของ effort/format บางตัว
    } as any);
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new ReadBillError("กุญแจ AI ใช้ไม่ได้ (หมดอายุหรือผิด) — แจ้งผู้ดูแลระบบ", 503);
    if (e instanceof Anthropic.RateLimitError) throw new ReadBillError("AI ถูกเรียกถี่เกินไป รอสักครู่แล้วลองใหม่", 429);
    if (e instanceof Anthropic.APIConnectionError) throw new ReadBillError("ต่อ AI ไม่ได้หรือใช้เวลานานเกินไป ลองใหม่อีกครั้ง", 504);
    if (e instanceof Anthropic.APIError) throw new ReadBillError(`AI ตอบผิดพลาด (${e.status ?? "?"}) ลองใหม่อีกครั้ง`, 502);
    throw e;
  }
  if (msg.stop_reason === "refusal") throw new ReadBillError("AI ไม่อ่านหน้านี้ — กรอกบิลใบนี้เอง", 422);
  if (msg.stop_reason === "max_tokens") throw new ReadBillError("หน้านี้มีข้อมูลมากเกินกว่าจะอ่านได้ในครั้งเดียว — แยกสแกนให้น้อยใบต่อหน้า", 422);
  const text = msg.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ?? "";
  let parsed: { bills?: AiBill[] };
  try { parsed = JSON.parse(text); } catch { throw new ReadBillError("AI ตอบกลับมาในรูปแบบที่อ่านไม่ได้ ลองใหม่อีกครั้ง", 502); }
  return {
    bills: Array.isArray(parsed.bills) ? parsed.bills : [],
    usage: { input: msg.usage?.input_tokens ?? 0, output: msg.usage?.output_tokens ?? 0 },
  };
}
