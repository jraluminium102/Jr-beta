import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import type { Role } from "@/lib/database.types";
import GalleryAdmin from "./GalleryAdmin";

export const dynamic = "force-dynamic";

export default async function GallerySettingsPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const role = profile.role as Role;
  if (!can(role, "product_gallery", "read")) redirect("/settings");

  const canWrite = can(role, "product_gallery", "write");
  return <GalleryAdmin canWrite={canWrite} />;
}
