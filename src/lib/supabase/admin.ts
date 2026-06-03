import { createClient as createAdmin } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

// Service-role client — bypass RLS. ใช้เฉพาะใน BFF สำหรับงาน privileged
// เช่น เขียน audit log, admin จัดการ role. ห้าม import ฝั่ง client.
export function createServiceClient() {
  return createAdmin<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
