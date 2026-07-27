// Types ฝั่ง TS สำหรับฟีเจอร์ "ใบปะหน้า" (job spec cover sheet)
//   ตรงกับ content jsonb ใน cover_sheets (migration 0111) — ดู src/lib/cover-sheet/generate.mjs (generator จริง, ห้ามแก้ logic)
//   โมเดลแบน (flat) WYSIWYG: คอลัมน์ซ้าย = list เดียว (group=หัวข้อชุด, spec=บุลเลท) · สิ่งที่เห็น = สิ่งที่พิมพ์

export type CoverMode = "short" | "grouped";
export type CoverColor = "" | "red" | "blue" | "green";
export type CoverLineKind = "spec" | "group";

// 1 บรรทัดในใบปะหน้า · kind:'group' = หัวข้อชุด (ตัวหนา + เลข n) · 'spec' = บุลเลทของ
export type CoverLine = { text: string; color?: CoverColor; hl?: boolean; kind?: CoverLineKind; n?: number };
export type CoverGroup = { n: number; title: string; lines: CoverLine[] };

export type CoverContent = {
  floorNote?: string;
  left: CoverLine[];   // คอลัมน์ "สั่งของเตรียมผลิต" (แบน)
  mid: CoverLine[];    // "แจ้งช่างตอนติดตั้ง"
  right: CoverLine[];  // "แจ้งลูกค้า + เตรียมของ"
};

export const EMPTY_CONTENT: CoverContent = { floorNote: "", left: [], mid: [], right: [] };

export type QuotationRefItem = { name: string; detail: string; group_label?: string | null; sort_order?: number };

export type CoverSheetGetResponse = {
  cover: { mode: CoverMode; content: CoverContent } | null;
  job: {
    job_code: string;
    customer_name: string;
    floor_work: string | null;
    floor_note: string | null;
    current_stage: number | null;
  };
  quotation: { id: number; code: string; items: QuotationRefItem[] } | null;
};

export type GenerateResponse = { left: CoverLine[]; quotation_id: number; quotation_code: string };
