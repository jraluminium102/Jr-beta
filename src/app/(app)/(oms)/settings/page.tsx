import { EmptyState } from "@/components/ui/primitives";

export default function SettingsPage() {
  return (
    <div className="p-4 sm:p-6 fade-in">
      <h1 className="text-xl sm:text-2xl font-bold text-white mb-4">ตั้งค่า</h1>
      <EmptyState title="หน้าตั้งค่าทั่วไป" sub="จัดการผู้ใช้ที่เมนู Users · ส่วนอื่นอยู่ใน roadmap" />
    </div>
  );
}
