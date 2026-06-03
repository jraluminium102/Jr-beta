import { ZodError } from "zod";
import { err } from "./response";
import { HttpError } from "./context";
import { createServiceClient } from "@/lib/supabase/admin";

// ครอบ route handler: แปลง error เป็น response shape เดียวกันทั้งระบบ
export function withRoute<Args extends unknown[]>(
  fn: (...args: Args) => Promise<Response>
) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof HttpError) return err(e.message, e.status);
      if (e instanceof ZodError) return err("Validation failed", 422, e.flatten());
      console.error("[BFF]", e);
      return err("Internal error", 500);
    }
  };
}

// audit log helper (best-effort, ไม่ block response)
export async function audit(entry: {
  jobId?: string | null;
  userId: string;
  action: string;
  table: string;
  recordId?: string;
  oldValue?: unknown;
  newValue?: unknown;
}) {
  try {
    const svc = createServiceClient();
    await svc.from("audit_logs").insert({
      job_id: entry.jobId ?? null,
      user_id: entry.userId,
      action: entry.action,
      table_name: entry.table,
      record_id: entry.recordId ?? null,
      old_value: (entry.oldValue ?? null) as never,
      new_value: (entry.newValue ?? null) as never,
    });
  } catch (e) {
    console.error("[audit]", e);
  }
}
