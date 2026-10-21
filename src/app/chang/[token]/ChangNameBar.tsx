"use client";

/**
 * แถบปุ่มลัดของลิงก์ช่าง (เบิกอลู · ใบตัด)
 *   ชื่อคนกดมาจากการล็อกอินด้วยรหัสพนักงาน (ChangGate · 0161) — เลิกช่อง "ฉันคือ:" พิมพ์ชื่อเองแล้ว
 *   api client แนบ x-chang-code ให้ทุกคำขอ → server แปลงเป็นชื่อเอง (src/lib/chang-staff.ts)
 */
export default function ChangNameBar({ token }: { token: string }) {
  return (
    <div className="flex items-center justify-end gap-2 px-4 pt-3 sm:px-6" style={{ background: "#f2f2f7" }}>
      {/* เบิกอลู (เจ้าของสั่ง 19 ต.ค.69) — ช่างเบิกเส้นเองผ่านมือถือ ผูกงาน ตัดสต็อกทันที */}
      <a href={`/chang/${token}/pick`}
        className="shrink-0 rounded-[10px] px-3 py-1.5 text-[13px] font-semibold min-h-[36px] inline-flex items-center text-white"
        style={{ background: "#007aff" }}>
        📦 เบิกอลู
      </a>
      {/* ทางเข้าใบตัด/ตัดประกอบ แบบไม่ต้องมีงานลูกค้า (ช่างเข้าได้อิสระ) */}
      <a href={`/chang/${token}/cutlist`}
        className="shrink-0 rounded-[10px] px-3 py-1.5 text-[13px] font-semibold min-h-[36px] inline-flex items-center text-white"
        style={{ background: "#5856d6" }}>
        ✂️ ใบตัด
      </a>
    </div>
  );
}
