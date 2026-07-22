"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Icon from "./Icon";
import { signOut } from "@/app/login/actions";
import { ROLE_LABEL, type Profile } from "@/lib/types";
import { menusFor, can } from "@/lib/rbac";
import type { Role } from "@/lib/database.types";
import { OverdueBadge, OverdueWidget } from "./OverdueWidget";

type NavItem = { href: string; icon: string; label: string };

// กลุ่มเอกสาร/บัญชี (ฝั่ง Quotation) — เห็นได้ทุก role ที่ล็อกอิน
const DOC_NAV: NavItem[] = [
  { href: "/queue", icon: "calendar", label: "คิวงาน" },
  { href: "/customers", icon: "users", label: "ทะเบียนลูกค้า" },
  { href: "/quotations", icon: "file", label: "ใบเสนอราคา" },
  { href: "/quotation-checklist", icon: "clipboard", label: "ใบเสนอ · เช็คลิสต์" },
  { href: "/calculator", icon: "calculator", label: "เครื่องคิดราคา" },
  { href: "/calculator40", icon: "calculator", label: "คิดราคา 4.0" },
  { href: "/billing-notes", icon: "banknote", label: "ใบวางบิล" },
  { href: "/receipts", icon: "receipt", label: "ใบเสร็จ/กำกับภาษี" },
  { href: "/warranties", icon: "shield", label: "ใบรับประกัน" },
  { href: "/stock", icon: "boxes", label: "เช็คสต๊อก" },
  { href: "/cutlist", icon: "box", label: "BOQ อลูมิเนียม" },
  { href: "/boq-daily", icon: "clipboard", label: "สรุป BOQ รายวัน" },
  { href: "/stats", icon: "chart", label: "สถิติ/รายงาน" },
];

// กลุ่มปฏิบัติงาน (ฝั่ง OMS) — กรองตาม role ผ่าน menusFor()
// หมายเหตุ: issues + sales_closure ยุบเข้า /follow-up แล้ว ไม่ต้องมีเมนูแยก
const OMS_NAV: Record<string, NavItem> = {
  dashboard:       { href: "/operations", icon: "dashboard", label: "ภาพรวมงาน" },
  followup:        { href: "/follow-up", icon: "track", label: "ติดตามงาน" },
  production:      { href: "/production", icon: "factory", label: "ผลิต" },
  prodqueue:       { href: "/production-schedule", icon: "calendar", label: "ตารางผลิต (ช่าง)" },
  measure_schedule:{ href: "/measure-schedule", icon: "ruler", label: "นัดวัดจริง" },
  designer:        { href: "/designer", icon: "ruler", label: "งานเขียนแบบ" },
  installation:    { href: "/installation", icon: "wrench", label: "ติดตั้ง" },
  finance:         { href: "/finance", icon: "banknote", label: "การเงิน" },
  settings:        { href: "/settings", icon: "gear", label: "ตั้งค่า" },
};

function NavLink({ n, active, onNav, badge }: { n: NavItem; active: boolean; onNav?: () => void; badge?: React.ReactNode }) {
  return (
    <Link
      href={n.href} onClick={onNav} aria-current={active ? "page" : undefined}
      className={`press flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${
        active ? "bg-white font-semibold shadow-md text-brand-dark" : "text-white/85 hover:bg-white/12"
      }`}
    >
      <Icon name={n.icon} size={18} /> {n.label}
      {badge}
    </Link>
  );
}

export default function Shell({ profile, children }: { profile: Profile; children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const active = (href: string) => path === href || path.startsWith(href + "/");

  const role = profile.role as Role;
  // ช่างผลิต — เข้าได้แค่หน้าตารางผลิต (เมนูตัวเดียว + เด้งกลับถ้าหลงเข้าหน้าอื่น)
  const isChang = role === "CHANG";
  useEffect(() => {
    if (isChang && !active("/production-schedule")) router.replace("/production-schedule");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isChang, path]);

  const omsKeys = menusFor(role);
  const omsItems = isChang
    ? [OMS_NAV.prodqueue]
    : omsKeys.map((k) => OMS_NAV[k]).filter(Boolean);

  // ซ่อนเมนูบางอันตามสิทธิ์: /queue (ADMIN/SALES), /stats (ผู้มีสิทธิ์ดูบัญชี)
  // quotation-checklist = ADMIN/SALES (ต้องมีสิทธิ์ jobs:write ถึงจะกด action ได้)
  // ช่างผลิต = ไม่เห็นเมนูเอกสาร/บัญชีเลย
  const docItems = isChang ? [] : DOC_NAV.filter((n) => {
    if (n.href === "/queue")                  return can(role, "queue",      "read");
    if (n.href === "/quotation-checklist")    return can(role, "jobs",       "write");
    if (n.href === "/boq-daily")              return can(role, "production",  "read");
    if (n.href === "/stats")                  return can(role, "finance",    "read");
    if (n.href === "/warranties")             return can(role, "warranties", "read");
    return true;
  });

  const Sidebar = ({ onNav }: { onNav?: () => void }) => (
    <div className="glass-dark rounded-2xl h-full p-4 flex flex-col text-white">
      <div className="px-2 py-3 border-b border-white/15 mb-3">
        <div className="text-xl font-extrabold tracking-wide">JR Beta</div>
        <div className="text-xs text-red-100/80">Aluminium &amp; Glass · ระบบรวม</div>
      </div>
      <nav className="space-y-1 flex-1 overflow-y-auto" aria-label="เมนูหลัก">
        <div className="text-[10px] uppercase tracking-wider text-red-100/50 px-3 pt-1 pb-1.5">เอกสาร / บัญชี</div>
        {docItems.map((n) => <NavLink key={n.href} n={n} active={active(n.href)} onNav={onNav} />)}
        {omsItems.length > 0 && (
          <div className="text-[10px] uppercase tracking-wider text-red-100/50 px-3 pt-3 pb-1.5">ปฏิบัติงาน</div>
        )}
        {omsItems.map((n) => (
          <NavLink
            key={n.href}
            n={n}
            active={active(n.href)}
            onNav={onNav}
            badge={n.href === "/measure-schedule" ? <OverdueBadge role={role} /> : undefined}
          />
        ))}
      </nav>
      <div className="border-t border-white/15 pt-3 mt-2">
        <div className="text-sm font-semibold truncate">{profile.full_name || "ผู้ใช้"}</div>
        <div className="text-[11px] text-red-100/70 mb-2">{ROLE_LABEL[profile.role] ?? profile.role}</div>
        <form action={signOut}>
          <button className="press w-full flex items-center justify-center gap-2 rounded-lg py-2 text-[12px] bg-white/12 hover:bg-white/20">
            <Icon name="logout" size={14} /> ออกจากระบบ
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="bgwrap">
      <div className="flex max-w-[1320px] mx-auto">
        {/* Desktop sidebar */}
        <aside className="w-60 flex-shrink-0 p-4 sticky top-0 h-screen hidden md:block no-print">
          <Sidebar />
        </aside>

        {/* Mobile drawer */}
        {open && (
          <div className="md:hidden fixed inset-0 z-50 flex no-print">
            <div className="absolute inset-0 scrim" onClick={() => setOpen(false)} />
            <div className="relative w-64 max-w-[80%] h-[100dvh] p-3">
              <Sidebar onNav={() => setOpen(false)} />
            </div>
          </div>
        )}

        {/* Content */}
        <main className="flex-1 min-w-0 p-4 md:pr-6">
          {/* mobile top bar */}
          <div className="md:hidden flex items-center gap-2 mb-4 glass rounded-2xl px-3 py-2 no-print">
            {/* ปุ่มเปิด drawer มือถือ: จุดแดงเล็กมุมบน-ขวาเมื่อมี overdue */}
            <div className="relative">
              <button aria-label="เปิดเมนู" onClick={() => setOpen(true)}
                className="press w-10 h-10 rounded-xl inline-flex items-center justify-center glass-soft text-brand-dark">
                <Icon name="dashboard" size={18} />
              </button>
              {!isChang && <MobileOverdueDot role={role} />}
            </div>
            <div className="text-sm font-semibold text-brand-dark">JR Beta</div>
            <span className="ml-auto text-[11px] text-ink-3">{ROLE_LABEL[profile.role] ?? profile.role}</span>
          </div>
          {/* P0-2A: OverdueBanner — แสดงเหนือ content (ช่างผลิตไม่ต้องเห็น) */}
          {!isChang && <OverdueWidget role={role} />}
          {children}
        </main>
      </div>
    </div>
  );
}

// จุดแดงเล็กมุมบน-ขวาบนปุ่มเมนูมือถือ — ใช้ OverdueBadge ซ้อน (shared shellQueryClient)
function MobileOverdueDot({ role }: { role: Role }) {
  if (!can(role, "production", "read")) return null;
  return (
    <div className="absolute -top-0.5 -right-0.5 pointer-events-none" aria-hidden="true">
      <OverdueBadge role={role} />
    </div>
  );
}
