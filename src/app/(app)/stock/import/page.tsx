import { getProfile, canWrite } from "@/lib/auth";
import { Card } from "@/components/ui";
import ImportClient from "./ImportClient";

export const dynamic = "force-dynamic";

export default async function StockImportPage() {
  const profile = await getProfile();
  if (!canWrite(profile?.role)) {
    return <div className="p-6 text-sm text-ink-3">ไม่มีสิทธิ์นำเข้ารูปสต็อก</div>;
  }
  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-brand-dark">นำเข้าสินค้าจากไฟล์ Stock1</h1>
        <p className="text-sm text-ink-3 mt-0.5">เพิ่มสินค้าทั้งหมด (แยกตามสี) พร้อมรูป · ราคา · จำนวนคงเหลือ — ดึงรูปจาก Google Drive เข้าเว็บถาวรอัตโนมัติ</p>
      </div>
      <Card className="p-4">
        <ImportClient />
      </Card>
    </div>
  );
}
