// วงเล็บ "(มีงาน ผรม.)" ต่อท้ายเลขใบเสนอราคา/เลขงาน
// โชว์เมื่อ jobs.floor_work != 'none' (ติ๊กจากหน้าเช็คลิสต์ใบเสนอราคา /quotation-checklist — migration 0090)
// เป็น read-only marker ล้วน ๆ — รายละเอียดว่าติดงานพื้นแบบไหน ให้ไปเช็ค/โน้ตต่อที่หน้าเช็คลิสต์เอง
export function FloorWorkBadge({
  floorWork, floorNote, dark = false,
}: {
  floorWork?: string | null;
  floorNote?: string | null;
  /** true = ใช้บนพื้นหลังกระจกมืด (หน้างานผลิต), false = พื้นหลังขาว (หน้าใบเสนอราคา) */
  dark?: boolean;
}) {
  if (!floorWork || floorWork === "none") return null;
  return (
    <span
      title={floorNote ? `ผรม.: ${floorNote}` : "มีงานพื้น ผรม. — เช็คละเอียดที่หน้าเช็คลิสต์ใบเสนอราคา"}
      className={
        dark
          ? "inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-300/30 text-amber-200 whitespace-nowrap"
          : "inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 border border-amber-300 text-amber-800 whitespace-nowrap"
      }
    >
      (มีงาน ผรม.)
    </span>
  );
}
