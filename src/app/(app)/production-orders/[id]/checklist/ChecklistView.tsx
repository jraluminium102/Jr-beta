"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type { ChecklistItem, ChecklistItemsState, Role } from "@/lib/database.types";
import type { ProductionOrder } from "@/lib/types";
import Icon from "@/components/Icon";

// ─── Types (ตาม shape ที่ GET /api/checklists/job/[orderId] คืน) ─────────────

type TemplateResult = {
  template: {
    id: number; name: string; target_role: Role[];
    product_keys: string[]; is_active: boolean;
  };
  items: ChecklistItem[];
  saved_checklist: {
    id: number; template_id: number;
    items_state: ChecklistItemsState;
    checked_by: string; checked_at: string;
  } | null;
};

type ChecklistData = {
  order: ProductionOrder;
  templates: TemplateResult[];
};

// ─── Single Template Checklist ────────────────────────────────────────────────

function TemplateChecklist({
  result,
  orderId,
  canCheck,
}: {
  result: TemplateResult;
  orderId: number;
  canCheck: boolean;
}) {
  const qc = useQueryClient();
  const { template, items, saved_checklist } = result;

  // Local state: รวม saved state จาก DB กับ local changes
  const [state, setState] = useState<ChecklistItemsState>(
    saved_checklist?.items_state ?? {}
  );
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState("");

  const saveMut = useMutation({
    mutationFn: () =>
      api.post(`/checklists/job/${orderId}`, {
        template_id: template.id,
        items_state: state,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["checklist-job", orderId] });
      setDirty(false);
      setSaveError("");
    },
    onError: (e) => setSaveError(e instanceof ApiError ? e.message : "บันทึกไม่สำเร็จ"),
  });

  function toggle(itemId: number) {
    if (!canCheck) return;
    setState((prev) => {
      const cur = prev[String(itemId)];
      return { ...prev, [String(itemId)]: { ...cur, checked: !(cur?.checked ?? false) } };
    });
    setDirty(true);
  }

  function setNote(itemId: number, note: string) {
    setState((prev) => ({
      ...prev,
      [String(itemId)]: { ...(prev[String(itemId)] ?? { checked: false }), note },
    }));
    setDirty(true);
  }

  const checkedCount = items.filter((it) => state[String(it.id)]?.checked).length;

  return (
    <div className="glass rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="font-bold text-brand-dark">{template.name}</h3>
          <div className="text-xs text-ink-3 mt-0.5 tabular-nums">
            {checkedCount}/{items.length} รายการ
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canCheck && dirty && (
            <button
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending}
              className="press bg-brand text-white rounded-xl px-4 py-2.5 text-sm font-semibold min-h-[44px] focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-50"
            >
              {saveMut.isPending ? "กำลังบันทึก…" : "บันทึก"}
            </button>
          )}
        </div>
      </div>

      {saveError && <p className="text-sm text-red-500">{saveError}</p>}

      <div className="space-y-2">
        {items.map((it) => {
          const itemState = state[String(it.id)];
          const isChecked = itemState?.checked ?? false;

          return (
            <div
              key={it.id}
              className={`rounded-xl border px-3 py-3 transition-colors ${
                isChecked
                  ? "border-green-300 bg-green-50"
                  : "border-gray-200 bg-white/50"
              }`}
            >
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggle(it.id)}
                  disabled={!canCheck}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand"
                />
                <div className="flex-1 min-w-0">
                  <span className={`text-sm ${isChecked ? "line-through text-ink-3" : "text-ink"}`}>
                    {it.seq}. {it.text}
                  </span>
                  {it.requires_sign && (
                    <span className="ml-2 text-[10px] text-blue-600 font-medium">ต้องเซ็น</span>
                  )}
                </div>
              </label>
              {/* Note field */}
              {canCheck && (
                <input
                  value={itemState?.note ?? ""}
                  onChange={(e) => setNote(it.id, e.target.value)}
                  placeholder="หมายเหตุ (ถ้ามี)"
                  className="mt-2 ml-7 w-[calc(100%-1.75rem)] text-xs rounded-lg border border-gray-200 px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand"
                />
              )}
            </div>
          );
        })}
      </div>

      {saved_checklist && (
        <p className="text-[11px] text-ink-3 text-right">
          บันทึกล่าสุด: {new Date(saved_checklist.checked_at).toLocaleString("th-TH")}
        </p>
      )}
    </div>
  );
}

// ─── Main View ────────────────────────────────────────────────────────────────

export default function ChecklistView({
  orderId,
  canCheck,
  role,
}: {
  orderId: string;
  canCheck: boolean;
  role: Role;
}) {
  const { data, isLoading, error } = useQuery<ChecklistData>({
    queryKey: ["checklist-job", orderId],
    queryFn: () =>
      api.get<ChecklistData>(`/checklists/job/${orderId}`).then((r) => r.data),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-ink-3 gap-2">
        <span className="w-4 h-4 rounded-full border-2 border-gray-300 border-t-brand animate-spin" />
        กำลังโหลดเช็คลิสต์…
      </div>
    );
  }

  if (error || !data) {
    return <div className="text-sm text-red-500 py-8 text-center">โหลดข้อมูลไม่สำเร็จ</div>;
  }

  const { order, templates } = data;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Link
          href={`/production-orders/${orderId}`}
          className="press glass-soft w-9 h-9 rounded-xl inline-flex items-center justify-center text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand"
          aria-label="ย้อนกลับ"
        >
          <Icon name="arrowLeft" size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-brand-dark">เช็คลิสต์งาน</h1>
          <div className="text-sm text-ink-2">{order.code} · {(order.customer_snapshot as { name?: string })?.name ?? "—"}</div>
        </div>
        <div className="ml-auto">
          <Link
            href={`/production-orders/${orderId}/cover`}
            className="press glass-soft rounded-xl px-4 py-2.5 text-sm font-semibold text-brand-dark inline-flex items-center gap-2 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-brand"
          >
            <Icon name="printer" size={16} /> ใบปะหน้า
          </Link>
        </div>
      </div>

      {templates.length === 0 && (
        <div className="glass rounded-2xl p-10 text-center text-sm text-ink-3">
          ไม่มีเช็คลิสต์สำหรับบทบาท {role} ในงานนี้
          {role === "ADMIN" && (
            <div className="mt-2 text-xs">
              <Link href="/settings/checklists" className="text-brand underline">
                ไปจัดการชุดเช็คลิสต์
              </Link>
            </div>
          )}
        </div>
      )}

      {templates.map((result) => (
        <TemplateChecklist
          key={result.template.id}
          result={result}
          orderId={Number(orderId)}
          canCheck={canCheck}
        />
      ))}
    </div>
  );
}
