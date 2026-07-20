import DocCutoffSetting from "./DocCutoffSetting";

export default function SettingsPage() {
  return (
    <div className="p-4 sm:p-6 fade-in space-y-4">
      <h1 className="text-xl sm:text-2xl font-bold text-white mb-1">ตั้งค่า</h1>
      <p className="text-sm mb-2" style={{ color: "var(--t-low)" }}>จัดการผู้ใช้ที่เมนู Users · ตั้งค่าทั่วไปด้านล่าง</p>
      <DocCutoffSetting />
    </div>
  );
}
