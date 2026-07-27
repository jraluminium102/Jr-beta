// Types ฝั่ง TS สำหรับฟีเจอร์ "ใบปะหน้า" (job spec cover sheet)
//   ตรงกับ content jsonb ใน cover_sheets (migration 0111) — ดู src/lib/cover-sheet/generate.mjs (generator จริง, ห้ามแก้ logic)

export type CoverMode = "short" | "grouped";
export type CoverColor = "" | "red" | "blue" | "green";

export type CoverLine = { text: string; color?: CoverColor; hl?: boolean };
export type CoverGroup = { n: number; title: string; lines: CoverLine[] };

export type CoverContent = {
  floorNote?: string;
  groups: CoverGroup[];
  midLines: CoverLine[];
  rightLines: CoverLine[];
};

export const EMPTY_CONTENT: CoverContent = { floorNote: "", groups: [], midLines: [], rightLines: [] };

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

export type CoverSheetRecord = {
  id: string;
  job_id: string;
  quotation_id: number | null;
  mode: CoverMode;
  content: CoverContent;
  updated_at: string;
};

export type GenerateResponse = { groups: CoverGroup[]; quotation_id: number; quotation_code: string };
