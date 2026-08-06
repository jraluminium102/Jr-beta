"use client";

import { useEffect } from "react";

/**
 * ตั้งชื่อหน้า = ชื่อไฟล์ PDF ที่ Chrome เสนอให้ตอนสั่ง "บันทึกเป็น PDF"
 * (Chrome ใช้ document.title เป็นชื่อไฟล์เริ่มต้นเสมอ — ไม่มีทางอื่นตั้งจากหน้าเว็บ)
 *
 * คืนชื่อเดิมตอนออกจากหน้า กันแท็บอื่นชื่อเพี้ยน
 */
export default function FloorPrintTitle({ title, auto = false }: { title: string; auto?: boolean }) {
  useEffect(() => {
    const prev = document.title;
    document.title = title;
    return () => { document.title = prev; };
  }, [title]);

  // มาจากปุ่ม "พิมพ์ / บันทึก PDF" ในหน้าแก้ไข → เปิดไดอะล็อกให้เลย ลดการกดไป 1 ครั้ง
  // รอ 1 เฟรมให้เบราว์เซอร์ตั้ง document.title เสร็จก่อน ไม่งั้นชื่อไฟล์ที่เสนอยังเป็นชื่อเดิม
  useEffect(() => {
    if (!auto) return;
    const t = setTimeout(() => window.print(), 350);
    return () => clearTimeout(t);
  }, [auto]);

  return null;
}
