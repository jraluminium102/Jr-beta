import CutListClient from "@/components/CutListClient";

export const dynamic = "force-dynamic";

// ใบตัด / BOQ (นำร่อง) — เอนจินใบตัดอลู · รากของ BOQ ต่องาน + ตัดสต็อก
export default function CutListPage() {
  return <CutListClient />;
}
