// Palette ไฮไลต์ (พื้นหลังข้อความ) ใช้ร่วมกันระหว่าง "แบบลูกค้า" (job-drawings) และ "ใบปะหน้า" (cover-sheet)
//   "" = ไม่มีไฮไลต์ · สีอื่น = พื้นสีอ่อน อ่านออกทั้งบนโซนมืด (editor) และโซนขาว (print)
export type HighlightColor = "" | "yellow" | "green" | "pink" | "blue" | "orange";

export const HIGHLIGHT_ORDER: HighlightColor[] = ["", "yellow", "green", "pink", "blue", "orange"];

export const HIGHLIGHT_HEX: Record<HighlightColor, string> = {
  "": "",
  yellow: "#fff35b",
  green: "#b7f7c0",
  pink: "#ffc7e0",
  blue: "#bfe3ff",
  orange: "#ffd9a0",
};

export const HIGHLIGHT_LABEL: Record<HighlightColor, string> = {
  "": "ไม่มี",
  yellow: "เหลือง",
  green: "เขียว",
  pink: "ชมพู",
  blue: "ฟ้า",
  orange: "ส้ม",
};

// cycle ไปสีถัดไป — none→เหลือง→เขียว→ชมพู→ฟ้า→ส้ม→none
export function nextHighlight(cur: HighlightColor | undefined): HighlightColor {
  const i = HIGHLIGHT_ORDER.indexOf(cur ?? "");
  return HIGHLIGHT_ORDER[(i + 1) % HIGHLIGHT_ORDER.length];
}
