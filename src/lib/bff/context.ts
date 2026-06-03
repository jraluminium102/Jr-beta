import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Profile, Role } from "@/lib/database.types";
import { can, type Action, type Resource } from "@/lib/rbac";

export type Ctx = {
  supabase: SupabaseClient<Database>;
  user: { id: string; email: string | null };
  profile: Profile;
  role: Role;
};

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export const Http = {
  unauthorized: () => new HttpError(401, "Unauthorized"),
  forbidden: () => new HttpError(403, "Forbidden"),
};
export { HttpError };

// โหลด session + profile/role ครั้งเดียวต่อ request (หัวใจของ BFF)
export async function getContext(): Promise<Ctx | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles").select("*").eq("id", user.id).single();
  if (!profile || !profile.is_active) return null;

  return { supabase, user: { id: user.id, email: user.email ?? null }, profile, role: profile.role };
}

// ใช้ใน route handler: คืน ctx หรือ throw HttpError ให้ withRoute จับ
export async function requirePermission(resource: Resource, action: Action): Promise<Ctx> {
  const ctx = await getContext();
  if (!ctx) throw Http.unauthorized();
  if (!can(ctx.role, resource, action)) throw Http.forbidden();
  return ctx;
}
