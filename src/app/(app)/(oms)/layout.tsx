import { Providers } from "@/app/providers";

// โซน OMS (งานผลิต/ติดตั้ง/ปัญหา/การเงิน) — พื้นแดงเข้ม กระจกขาว + React Query
export default function OmsZoneLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <div className="app-bg rounded-2xl p-3 sm:p-4 min-h-[calc(100dvh-2rem)]">
        {children}
      </div>
    </Providers>
  );
}
