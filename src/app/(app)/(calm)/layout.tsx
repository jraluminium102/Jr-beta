import { Providers } from "@/app/providers";

// โซนสบายตา (พื้นเทาอมฟ้าอ่อน ตัวหนังสือเข้ม) + React Query
//   เจ้าของ 16 พ.ย.69: หน้าคิวงานพื้นไม่เอาพื้นแดงของโซน OMS (แสบตา) → ย้ายมาอยู่กลุ่มนี้ · URL เดิม /floor-queue
export default function CalmZoneLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <div className="rounded-2xl p-3 sm:p-4 min-h-[calc(100dvh-2rem)] bg-[#F1F5F9] border border-slate-200 text-slate-900">
        {children}
      </div>
    </Providers>
  );
}
