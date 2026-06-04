import { createClient } from "@/lib/supabase/server";
import type { Profile, Role } from "@/lib/database.types";
import { can, type Action, type Resource } from "@/lib/rbac";

// ใช้ ReturnType เพื่อกันปัญหา type parameter ของ SupabaseClient ที่เปลี่ยนตาม @supabase/ssr version
type SupabaseServerClient = ReturnType<typeof createClient>;

export type Ctx = {
  supabase: SupabaseServerClient;
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profileRaw } = await supabase
    .from("profiles").select("*").eq("id", user.id).single();
  // cast ผ่าน unknown เพราะ Supabase >=2.45 เปลี่ยน generic signature ทำให้ infer เป็น never
  const profile = profileRaw as unknown as Profile | null;
  if (!profile || !profile.is_active) return null;

  return { supabase, user: { id: user.id, email: user.email ?? null }, profile, role: profile.role as Role };
}

// ใช้ใน route handler: คืน ctx หรือ throw HttpError ให้ withRoute จับ
export async function requirePermission(resource: Resource, action: Action): Promise<Ctx> {
  const ctx = await getContext();
  if (!ctx) throw Http.unauthorized();
  if (!can(ctx.role, resource, action)) throw Http.forbidden();
  return ctx;
}
