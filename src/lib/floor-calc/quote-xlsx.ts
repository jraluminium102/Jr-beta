import { writeXlsx, S, type Row, type SheetSpec } from "./xlsx-write";
import { DEFAULT_FOOTER_NOTES } from "./engine.mjs";

/**
 * ประกอบ "ใบเสนอราคางานพื้น" เป็นไฟล์ Excel ตามฟอร์มช่าง
 * โครงเดียวกับหน้าพิมพ์ (floor-works/[id]/print) เป๊ะ — คนละสื่อ แต่ต้องออกมาเหมือนกัน
 */

export type XlsxItem = {
  group_label?: string;
  name: string;
  qty: number;
  unit: string;
  material_price?: number | null;
  labor_price?: number | null;
  unit_price: number;
  line_total: number;
  remark?: string;
};

export type XlsxQuote = {
  customer: { name: string; address?: string; phone?: string };
  issueDate: string;
  revLabel?: string;
  items: XlsxItem[];
  contractor?: { name?: string; phone?: string; bank_name?: string; bank_acc?: string };
  note?: string;
  /** งวดเงิน — ถ้ามีจะเพิ่มชีต "ใบเบิกงวด" */
  installments?: { label: string; amount: number; work_items?: string; is_final?: boolean }[];
};

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** จัดรายการเป็นหมวด (คงลำดับเดิม) */
function group(items: XlsxItem[]) {
  const order: string[] = [];
  const map = new Map<string, XlsxItem[]>();
  for (const it of items) {
    const g = String(it.group_label ?? "").trim();
    if (!map.has(g)) { map.set(g, []); order.push(g); }
    map.get(g)!.push(it);
  }
  return order.map((label) => {
    const list = map.get(label)!;
    return { label, items: list, subtotal: r2(list.reduce((a, i) => a + (Number(i.line_total) || 0), 0)) };
  });
}

const COLS = 9; // ลำดับ · รายการ · ปริมาณ · หน่วย · ค่าวัสดุ · ค่าแรง · ราคางาน · รวมสุทธิ · หมายเหตุ

export function buildQuoteXlsx(q: XlsxQuote): Buffer {
  const groups = group(q.items);
  const multi = groups.length > 1;
  const total = r2(q.items.reduce((a, i) => a + (Number(i.line_total) || 0), 0));
  const rows: Row[] = [];
  const merges: string[] = [];
  const heights: Record<number, number> = {};

  const blank = (n: number): Row => Array.from({ length: n }, () => ({ v: "" }));
  const push = (r: Row) => { rows.push(r); return rows.length; }; // คืนเลขแถว 1-based

  // ── หัวเอกสาร ──
  let rn = push([{ v: `เอกสารแสดงปริมาณและราคางานสถาปัตย์${q.revLabel ?? ""}`, s: S.title }, ...blank(COLS - 1)]);
  merges.push(`A${rn}:${String.fromCharCode(64 + COLS)}${rn}`);
  heights[rn] = 26;

  const addr = [q.customer.name, q.customer.address].filter(Boolean).join(" ");
  rn = push([{ v: `รายการงาน  ${addr}`, s: S.sub }, ...blank(COLS - 1)]);
  merges.push(`A${rn}:${String.fromCharCode(64 + COLS)}${rn}`);
  heights[rn] = 30;

  rn = push([
    { v: `วันที่  ${q.issueDate}`, s: S.sub }, ...blank(COLS - 3),
    { v: q.contractor?.phone ? `โทร ${q.contractor.phone}` : "", s: S.sub }, { v: "" },
  ]);
  push(blank(COLS));

  // ── หัวตาราง (2 ชั้น: ราคา/หน่วย คร่อม 3 ช่อง) ──
  const h1 = push([
    { v: "ลำดับ", s: S.th }, { v: "รายการ", s: S.th }, { v: "ปริมาณ", s: S.th }, { v: "หน่วย", s: S.th },
    { v: "ราคา/หน่วย/บาท", s: S.th }, { v: "", s: S.th }, { v: "", s: S.th },
    { v: "ราคารวมสุทธิ (บาท)", s: S.th }, { v: "หมายเหตุ", s: S.th },
  ]);
  const h2 = push([
    { v: "", s: S.th }, { v: "", s: S.th }, { v: "", s: S.th }, { v: "", s: S.th },
    { v: "ค่าวัสดุ", s: S.th }, { v: "ค่าแรง", s: S.th }, { v: "ราคางาน", s: S.th },
    { v: "", s: S.th }, { v: "", s: S.th },
  ]);
  heights[h1] = 18; heights[h2] = 18;
  for (const c of ["A", "B", "C", "D", "H", "I"]) merges.push(`${c}${h1}:${c}${h2}`);
  merges.push(`E${h1}:G${h1}`);

  // ── รายการ ──
  for (const g of groups) {
    if (g.label) {
      const gr = push([{ v: g.label, s: S.group }, ...Array.from({ length: COLS - 1 }, () => ({ v: "", s: S.group }))]);
      merges.push(`A${gr}:${String.fromCharCode(64 + COLS)}${gr}`);
    }
    g.items.forEach((it, i) => {
      push([
        { v: i + 1, s: S.tdC },
        { v: it.name, s: S.td },
        { v: Number(it.qty) || 0, s: S.num },
        { v: it.unit || "งาน", s: S.tdC },
        { v: it.material_price == null ? "-" : Number(it.material_price), s: it.material_price == null ? S.tdC : S.num },
        { v: it.labor_price == null ? "-" : Number(it.labor_price), s: it.labor_price == null ? S.tdC : S.num },
        { v: Number(it.unit_price) || 0, s: S.num },
        { v: Number(it.line_total) || 0, s: S.num },
        { v: it.remark ?? "", s: S.tdC },
      ]);
    });
    if (multi) {
      const sr = push([
        ...Array.from({ length: 7 }, () => ({ v: "", s: S.totalLbl })),
        { v: g.subtotal, s: S.totalNum }, { v: "", s: S.tdC },
      ]);
      rows[sr - 1][0] = { v: `ยอดโดยรวม ${g.label || "(ไม่มีหมวด)"}`, s: S.totalLbl };
      merges.push(`A${sr}:G${sr}`);
    }
  }

  // ── ยอดรวม ──
  const tr = push([
    { v: "ยอดโดยรวมสุทธิ", s: S.totalLbl },
    ...Array.from({ length: 6 }, () => ({ v: "", s: S.totalLbl })),
    { v: total, s: S.totalNum }, { v: "", s: S.tdC },
  ]);
  merges.push(`A${tr}:G${tr}`);
  heights[tr] = 20;

  // ── หมายเหตุ ──
  push(blank(COLS));
  for (const [i, n] of [...DEFAULT_FOOTER_NOTES, ...(q.note ? [q.note] : [])].entries()) {
    const nr = push([{ v: (i === 0 ? "หมายเหตุ: " : "") + n, s: S.note }, ...blank(COLS - 1)]);
    merges.push(`A${nr}:${String.fromCharCode(64 + COLS)}${nr}`);
    heights[nr] = 14;
  }

  // ── ลายเซ็น ──
  push(blank(COLS));
  push(blank(COLS));
  const sg = push([
    { v: q.contractor?.name ?? "", s: S.tdC }, ...blank(3),
    { v: "..............................", s: S.tdC }, ...blank(3),
  ]);
  merges.push(`A${sg}:D${sg}`, `E${sg}:I${sg}`);
  const sg2 = push([{ v: "ผู้รับจ้าง", s: S.tdC }, ...blank(3), { v: "ผู้ว่าจ้าง", s: S.tdC }, ...blank(3)]);
  merges.push(`A${sg2}:D${sg2}`, `E${sg2}:I${sg2}`);

  const sheets: SheetSpec[] = [{
    name: "ใบเสนอราคา",
    rows,
    widths: [6, 52, 8, 8, 11, 11, 11, 13, 11],
    merges,
    heights,
  }];

  // ── ชีตใบเบิกงวด (ถ้ามี) ──
  if (q.installments?.length) {
    const ir: Row[] = [];
    const im: string[] = [];
    const ih: Record<number, number> = {};
    const ipush = (r: Row) => { ir.push(r); return ir.length; };
    const iblank = () => Array.from({ length: 4 }, () => ({ v: "" }));

    let n = ipush([{ v: `ใบเบิกงวดงานพื้น ${q.customer.name}${q.revLabel ?? ""}`, s: S.title }, ...iblank()]);
    im.push(`A${n}:E${n}`); ih[n] = 26;
    ipush(iblank());

    for (const inst of q.installments) {
      const lines = String(inst.work_items ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
      if (lines.length) {
        n = ipush([{ v: `${inst.label} มีรายการดังนี้`, s: S.sub }, ...iblank()]);
        im.push(`A${n}:E${n}`);
        lines.forEach((ln, i) => {
          const lr = ipush([{ v: "" }, { v: `${i + 1}. ${ln}`, s: S.note }, ...iblank()]);
          im.push(`B${lr}:E${lr}`);
        });
        n = ipush([{
          v: inst.is_final
            ? `งานแล้วเสร็จตามรายการดังกล่าว จึงขอส่งงาน และเก็บเงินส่วนที่เหลือ งวดสุดท้าย ${inst.amount.toLocaleString()} บาท`
            : `งานแล้วเสร็จตามรายการดังกล่าว จึงขอเบิก${inst.label} เป็นเงิน ${inst.amount.toLocaleString()} บาท`,
          s: S.sub,
        }, ...iblank()]);
        im.push(`A${n}:E${n}`);
      } else {
        n = ipush([{ v: `${inst.label}  ${inst.amount.toLocaleString()} บาท`, s: S.sub }, ...iblank()]);
        im.push(`A${n}:E${n}`);
      }
      ipush(iblank());
    }

    const sum = r2(q.installments.reduce((a, i) => a + (Number(i.amount) || 0), 0));
    n = ipush([{ v: "รวมทุกงวด", s: S.totalLbl }, { v: "" }, { v: "" }, { v: sum, s: S.totalNum }, { v: "" }]);
    im.push(`A${n}:C${n}`);
    ipush(iblank());
    n = ipush([{ v: "ชำระโดย", s: S.sub }, ...iblank()]);
    n = ipush([{ v: `ชื่อบัญชี ${q.contractor?.name ?? "—"}`, s: S.note }, ...iblank()]); im.push(`A${n}:E${n}`);
    n = ipush([{ v: `เลขบัญชี ${q.contractor?.bank_acc ?? "—"}  ${q.contractor?.bank_name ?? ""}`, s: S.note }, ...iblank()]); im.push(`A${n}:E${n}`);
    if (q.contractor?.phone) { n = ipush([{ v: `เบอร์โทร ${q.contractor.phone}`, s: S.note }, ...iblank()]); im.push(`A${n}:E${n}`); }
    ipush(iblank()); ipush(iblank());
    n = ipush([{ v: q.contractor?.name ?? "", s: S.tdC }, { v: "" }, { v: "" }, { v: "..............................", s: S.tdC }, { v: "" }]);
    n = ipush([{ v: "ผู้รับจ้าง", s: S.tdC }, { v: "" }, { v: "" }, { v: "ผู้ว่าจ้าง", s: S.tdC }, { v: "" }]);

    sheets.push({ name: "ใบเบิกงวด", rows: ir, widths: [24, 40, 8, 18, 12], merges: im, heights: ih });
  }

  return writeXlsx(sheets);
}
