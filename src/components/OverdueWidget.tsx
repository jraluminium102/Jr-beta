"use client";

/**
 * OverdueWidget — badge count + banner สำหรับ Shell
 * มี QueryClient ของตัวเองเพราะ Shell อยู่นอก OMS Providers
 */

import { useState, useEffect, useCallback } from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/api";
import type { Role } from "@/lib/database.types";
import { can } from "@/lib/rbac";

// roles ที่เห็น measure_schedule = เห็น production:read
function canSeeMeasureSchedule(role: Role): boolean {
  return can(role, "production", "read");
}

// localStorage key สำหรับ banner dismiss state
const LS_KEY = "overdueBanner";
type BannerState = { date: string; count: number };

// ── Inner component (ใช้ useQuery) ─────────────────────────────────────────────
function OverdueInner({ role }: { role: Role }) {
  const enabled = canSeeMeasureSchedule(role);

  const { data } = useQuery({
    queryKey: ["overdue-count"],
    queryFn: () => api.get<{ count: number }>("/measure-schedule/overdue-count"),
    staleTime: 60_000,
    refetchInterval: 300_000,
    refetchOnWindowFocus: true,
    enabled,
  });

  const count = data?.data?.count ?? 0;

  // ── Banner dismiss logic ────────────────────────────────────────────────────
  const [bannerDismissed, setBannerDismissed] = useState(true); // ค่าเริ่มต้น dismiss ไว้ก่อน (hydration safe)

  useEffect(() => {
    if (count === 0) {
      // ล้าง flag เมื่อ count = 0
      try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
      setBannerDismissed(true);
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) {
        // ยังไม่เคย dismiss → แสดง
        setBannerDismissed(false);
        return;
      }
      const state = JSON.parse(raw) as BannerState;
      // เด้งซ้ำถ้าวันเปลี่ยน หรือ count เพิ่มขึ้นจากตอนปิด
      if (state.date !== today || count > state.count) {
        setBannerDismissed(false);
      } else {
        setBannerDismissed(true);
      }
    } catch {
      setBannerDismissed(false);
    }
  }, [count]);

  const dismissBanner = useCallback(() => {
    const today = new Date().toISOString().slice(0, 10);
    try {
      const state: BannerState = { date: today, count };
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch { /* ignore */ }
    setBannerDismissed(true);
  }, [count]);

  if (!enabled) return null;

  return (
    <>
      {/* OverdueBanner — แสดงเหนือ children ใน Shell */}
      {count > 0 && !bannerDismissed && (
        <div
          id="overdue-banner"
          role="alert"
          className="flex items-center gap-2 px-3 py-2 bg-rose-600/90 text-white text-[13px] font-medium rounded-xl mb-3 no-print"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>
          </svg>
          <span className="flex-1">
            มี <span className="tabular-nums font-bold">{count}</span> งานเลยนัดวัดแล้วยังไม่วัด
          </span>
          <Link
            href="/measure-schedule"
            className="focusable pressable inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/20 hover:bg-white/30 text-white text-[12px] font-semibold min-h-[32px]"
          >
            ดูงาน
          </Link>
          <button
            onClick={dismissBanner}
            aria-label="ปิดแจ้งเตือน"
            className="focusable pressable w-7 h-7 inline-flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/25 text-white/80"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
            </svg>
          </button>
        </div>
      )}
    </>
  );
}

// QueryClient เบาสำหรับ Shell (แยกจาก OMS Providers)
const shellQueryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, refetchOnWindowFocus: true } },
});

// ── Export: badge count hook (สำหรับ NavLink ใน Shell) ─────────────────────────
export function OverdueWidget({ role }: { role: Role }) {
  return (
    <QueryClientProvider client={shellQueryClient}>
      <OverdueInner role={role} />
    </QueryClientProvider>
  );
}

// ── Export: badge count standalone (สำหรับ NavLink) ────────────────────────────
function OverdueBadgeInner({ role }: { role: Role }) {
  const enabled = canSeeMeasureSchedule(role);
  const { data } = useQuery({
    queryKey: ["overdue-count"],
    queryFn: () => api.get<{ count: number }>("/measure-schedule/overdue-count"),
    staleTime: 60_000,
    refetchInterval: 300_000,
    refetchOnWindowFocus: true,
    enabled,
  });
  const count = data?.data?.count ?? 0;
  if (!enabled || count === 0) return null;
  return (
    <span
      aria-label={`${count} งานเลยนัด`}
      className="ml-auto inline-flex items-center justify-center bg-rose-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 tabular-nums leading-none"
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

export function OverdueBadge({ role }: { role: Role }) {
  return (
    <QueryClientProvider client={shellQueryClient}>
      <OverdueBadgeInner role={role} />
    </QueryClientProvider>
  );
}
