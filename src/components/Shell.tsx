"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "./Icon";
import { signOut } from "@/app/login/actions";
import { ROLE_LABEL, type Profile } from "@/lib/types";
import { menusFor, docMenusFor } from "@/lib/rbac";
import type { Role } from "@/lib/database.types";

type NavItem = { href: string; icon: string; label: string };

// กลุ่มเอกสาร/บัญชี — keyed โดย key เดียวกับที่ docMenusFor() คืน
const DOC_NAV_MAP: Record<string, NavItem> = {
  dashboard:         { href: "/dashboard",         icon: "dashboard",   label: "Dashboard" },
  queue:             { href: "/queue",              icon: "calendar",    label: "คิวงาน" },
  customers:         { href: "/customers",          icon: "users",       label: "ทะเบียนลูกค้า" },
  quotations:        { href: "/quotations",         icon: "file",        label: "ใบเสนอราคา" },
  calculator:        { href: "/calculator",         icon: "calculator",  label: "เครื่องคิดราคา" },
  billing:           { href: "/billing-notes",      icon: "banknote",    label: "ใบวางบิล" },
  receipts:          { href: "/receipts",           icon: "receipt",     label: "ใบเสร็จ/กำกับภาษี" },
  production_orders: { href: "/production-orders",  icon: "factory",     label: "ใบสั่งผลิต" },
  warranties:        { href: "/warranties",         icon: "shield",      label: "ใบรับประกัน" },
  stock:             { href: "/stock",              icon: "boxes",       label: "เช็คสต๊อก" },
};

// กลุ่มปฏิบัติงาน (ฝั่ง OMS) — กรองตาม role ผ่าน menusFor()
const OMS_NAV: Record<string, NavItem> = {
  dashboard:    { href: "/operations", icon: "dashboard", label: "ภาพรวมงาน" },
  jobs:         { href: "/jobs", icon: "briefcase", label: "งานทั้งหมด" },
  production:   { href: "/production", icon: "factory", label: "ผลิต" },
  installation: { href: "/installation", icon: "wrench", label: "ติดตั้ง" },
  issues:       { href: "/issues", icon: "warn", label: "ปัญหา (Issues)" },
  finance:      { href: "/finance", icon: "banknote", label: "การเงิน" },
  users:        { href: "/settings/users", icon: "users", label: "ผู้ใช้" },
  settings:     { href: "/settings", icon: "gear", label: "ตั้งค่า" },
};

function NavLink({ n, active, onNav }: { n: NavItem; active: boolean; onNav?: () => void }) {
  return (
    <Link
      href={n.href} onClick={onNav} aria-current={active ? "page" : undefined}
      className={`press flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${
        active ? "bg-white font-semibold shadow-md text-brand-dark" : "text-white/85 hover:bg-white/12"
      }`}
    >
      <Icon name={n.icon} size={18} /> {n.label}
    </Link>
  );
}

export default function Shell({ profile, children }: { profile: Profile; children: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const active = (href: string) => path === href || path.startsWith(href + "/");

  const role = profile.role as Role;

  // กรองเมนูทั้งสองกลุ่มตาม role
  const docKeys = docMenusFor(role);
  const docItems = docKeys.map((k) => DOC_NAV_MAP[k]).filter(Boolean);

  const omsKeys = menusFor(role);
  const omsItems = omsKeys.map((k) => OMS_NAV[k]).filter(Boolean);

  const Sidebar = ({ onNav }: { onNav?: () => void }) => (
    <div className="glass-dark rounded-2xl h-full p-4 flex flex-col text-white">
      <div className="px-2 py-3 border-b border-white/15 mb-3">
        <div className="text-xl font-extrabold tracking-wide">JR Beta</div>
        <div className="text-xs text-red-100/80">Aluminium &amp; Glass · ระบบรวม</div>
      </div>
      <nav className="space-y-1 flex-1 overflow-y-auto" aria-label="เมนูหลัก">
        {docItems.length > 0 && (
          <div className="text-[10px] uppercase tracking-wider text-red-100/50 px-3 pt-1 pb-1.5">เอกสาร / บัญชี</div>
        )}
        {docItems.map((n) => <NavLink key={n.href} n={n} active={active(n.href)} onNav={onNav} />)}
        {omsItems.length > 0 && (
          <div className="text-[10px] uppercase tracking-wider text-red-100/50 px-3 pt-3 pb-1.5">ปฏิบัติงาน</div>
        )}
        {omsItems.map((n) => <NavLink key={n.href} n={n} active={active(n.href)} onNav={onNav} />)}
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
            <button aria-label="เปิดเมนู" onClick={() => setOpen(true)}
              className="press w-10 h-10 rounded-xl inline-flex items-center justify-center glass-soft text-brand-dark">
              <Icon name="dashboard" size={18} />
            </button>
            <div className="text-sm font-semibold text-brand-dark">JR Beta</div>
            <span className="ml-auto text-[11px] text-ink-3">{ROLE_LABEL[profile.role] ?? profile.role}</span>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
