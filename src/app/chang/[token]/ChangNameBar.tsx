"use client";
import { useEffect, useState } from "react";

/**
 * แถบ "ฉันคือ:" ของลิงก์ช่าง — เก็บชื่อลง localStorage คีย์ `chang_name`
 * api client อ่านคีย์นี้ไปแนบ header x-chang-name ทุกคำขอ (src/lib/api.ts) → server เอาไปทำ audit
 * (ช่างผ่านลิงก์ไม่มี user account จึงต้องพิมพ์ชื่อเองว่าใครกด)
 */
export default function ChangNameBar({ token }: { token: string }) {
  const [name, setName] = useState("");
  useEffect(() => { try { setName(localStorage.getItem("chang_name") || ""); } catch { /* ignore */ } }, []);
  const save = (v: string) => {
    setName(v);
    try { localStorage.setItem("chang_name", v); } catch { /* ignore */ }
  };
  return (
    <div className="flex items-center gap-2 px-4 pt-4 sm:px-6" style={{ background: "#f2f2f7" }}>
      <span className="text-[13px]" style={{ color: "#636366" }}>ฉันคือ:</span>
      <input
        value={name}
        onChange={(e) => save(e.target.value)}
        placeholder="ใส่ชื่อช่าง (ไว้บันทึกว่าใครกด)"
        className="flex-1 max-w-[260px] rounded-[10px] px-3 py-1.5 text-[14px] outline-none border bg-white"
        style={{ borderColor: "#e5e5ea", color: "#1c1c1e" }}
      />
      {!name && <span className="text-[11.5px]" style={{ color: "#ff9500" }}>← ใส่ชื่อก่อนกดงาน</span>}
      {/* ทางเข้าใบตัด/ตัดประกอบ แบบไม่ต้องมีงานลูกค้า (ช่างเข้าได้อิสระ) */}
      <a href={`/chang/${token}/cutlist`}
        className="ml-auto shrink-0 rounded-[10px] px-3 py-1.5 text-[13px] font-semibold min-h-[36px] inline-flex items-center text-white"
        style={{ background: "#5856d6" }}>
        ✂️ ใบตัด
      </a>
    </div>
  );
}
