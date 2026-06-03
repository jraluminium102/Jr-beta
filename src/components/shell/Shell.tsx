"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavIcons, X, LogOut, Menu } from "@/components/ui/icons";
import { MENU_LABEL } from "@/lib/constants";
import type { Role } from "@/lib/database.types";
import { cn } from "@/lib/format";

const HREF: Record<string, string> = {
  dashboard: "/", jobs: "/jobs", production: "/production", installation: "/installation",
  issues: "/issues", finance: "/finance", users: "/settings/users", settings: "/settings",
};

function NavList({ menus, pathname, onNav }: { menus: string[]; pathname: string; onNav?: () => void }) {
  return (
    <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
      {menus.map((m) => {
        const I = NavIcons[m];
        const active = HREF[m] === pathname || (m !== "dashboard" && pathname.startsWith(HREF[m]));
        return (
          <Link key={m} href={HREF[m]} onClick={onNav} aria-current={active ? "page" : undefined}
            className={cn("focusable pressable flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm min-h-[44px] transition",
              active ? "bg-white text-[#1F4E78] font-semibold shadow" : "text-white/72 hover:bg-white/10 hover:text-white")}>
            <I size={19} /> {MENU_LABEL[m]}
          </Link>
        );
      })}
    </nav>
  );
}

function SignOut() {
  return (
    <form action="/auth/signout" method="post" className="px-4 py-4 border-t border-white/10">
      <button type="submit" className="focusable pressable flex items-center gap-2 text-[12px] min-h-[40px]" style={{ color: "var(--t-low)" }}>
        <LogOut size={15} /> ออกจากระบบ
      </button>
    </form>
  );
}

const Brand = () => (
  <div className="flex items-center gap-2.5">
    <div className="w-9 h-9 rounded-lg glass-card flex items-center justify-center text-white font-bold text-sm">JR</div>
    <div><div className="text-white font-bold text-sm leading-tight">JR OMS</div><div className="text-[10px]" style={{ color: "var(--t-low)" }}>Aluminium &amp; Glass</div></div>
  </div>
);

export function Shell({ menus, role, userName, avatarUrl, children }: {
  menus: string[]; role: Role; userName: string; avatarUrl?: string | null; children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileNav, setMobileNav] = useState(false);
  const bottomNav = menus.slice(0, 5);
  const initial = userName.trim().charAt(0).toUpperCase() || "U";

  return (
    <div className="app-bg min-h-[100dvh] flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-56 flex-shrink-0 glass flex-col rounded-r-3xl">
        <div className="px-5 py-5 border-b border-white/10"><Brand /></div>
        <NavList menus={menus} pathname={pathname} />
        <SignOut />
      </aside>

      {/* Mobile drawer */}
      {mobileNav && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 scrim fade-in" onClick={() => setMobileNav(false)} />
          <aside className="relative w-64 max-w-[80%] h-[100dvh] glass flex flex-col slide-in">
            <div className="px-5 py-5 border-b border-white/10 flex items-center justify-between">
              <Brand />
              <button onClick={() => setMobileNav(false)} aria-label="ปิดเมนู" className="focusable pressable w-11 h-11 inline-flex items-center justify-center rounded-xl text-white/75 hover:bg-white/10"><X size={20} /></button>
            </div>
            <NavList menus={menus} pathname={pathname} onNav={() => setMobileNav(false)} />
            <SignOut />
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="glass px-3 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between gap-2 lg:rounded-bl-3xl">
          <div className="flex items-center gap-2 min-w-0">
            <button onClick={() => setMobileNav(true)} aria-label="เปิดเมนู" className="lg:hidden focusable pressable w-11 h-11 inline-flex items-center justify-center rounded-xl text-white/80 hover:bg-white/10"><Menu size={20} /></button>
            <div className="text-[12px] truncate" style={{ color: "var(--t-low)" }}>บทบาท: <span className="text-white/85 font-medium">{role}</span></div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="flex items-center gap-2 pl-1">
              {avatarUrl
                ? <img src={avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover" />
                : <div className="w-9 h-9 rounded-full bg-gradient-to-br from-sky-400 to-indigo-500 flex items-center justify-center text-white text-xs font-bold">{initial}</div>}
              <span className="hidden sm:block text-sm text-white/85 max-w-[120px] truncate">{userName}</span>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto pb-24 lg:pb-0">{children}</div>
      </div>

      {/* Bottom nav (mobile, ≤5) */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 glass px-2 pt-2 pb-safe flex items-center justify-around rounded-t-3xl">
        {bottomNav.map((m) => {
          const I = NavIcons[m];
          const active = HREF[m] === pathname || (m !== "dashboard" && pathname.startsWith(HREF[m]));
          return (
            <Link key={m} href={HREF[m]} aria-current={active ? "page" : undefined}
              className={cn("focusable pressable flex flex-col items-center gap-1 px-2 py-1.5 rounded-xl min-w-[56px] min-h-[48px] justify-center", active ? "text-white" : "text-white/55")}>
              <span className={active ? "text-sky-300" : ""}><I size={21} /></span>
              <span className="text-[10px] font-medium">{MENU_LABEL[m]}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
