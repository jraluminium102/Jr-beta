import Link from "next/link";
import DocCutoffSetting from "./DocCutoffSetting";

export default function SettingsPage() {
  return (
    <div className="p-4 sm:p-6 fade-in space-y-4">
      <h1 className="text-xl sm:text-2xl font-bold text-white mb-1">ตั้งค่า</h1>
      <p className="text-sm mb-2" style={{ color: "var(--t-low)" }}>จัดการผู้ใช้ · เพิ่มบัญชี/ตั้งบทบาท · ตั้งค่าทั่วไปด้านล่าง</p>

      {/* จัดการผู้ใช้ (เพิ่มบัญชี/ตั้ง role) — ลิงก์ไปหน้า users (เดิมไม่มีทางเข้าจากเมนู) */}
      <Link href="/settings/users" className="press glass-card rounded-2xl p-4 flex items-center gap-3 hover:bg-white/10">
        <span className="w-11 h-11 rounded-xl bg-white/15 inline-flex items-center justify-center text-2xl shrink-0">👥</span>
        <span className="min-w-0 flex-1">
          <span className="block text-white font-semibold">จัดการผู้ใช้ / เพิ่มผู้ใช้</span>
          <span className="block text-[12px]" style={{ color: "var(--t-low)" }}>สร้างบัญชีพนักงาน (เช่น สโตร์ · ไม่เห็นราคา) · ตั้งบทบาท · เปิด-ปิดการใช้งาน</span>
        </span>
        <span className="text-white/60 text-xl shrink-0">›</span>
      </Link>

      <DocCutoffSetting />
    </div>
  );
}
