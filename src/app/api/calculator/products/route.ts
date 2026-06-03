import { NextResponse } from "next/server";
import { getProducts, getGlassOptions, getColorOptions } from "@/lib/calculator/engine";
import { getProfile } from "@/lib/auth";

export async function GET() {
  const profile = await getProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    products: getProducts(),
    glass: getGlassOptions(),
    colors: getColorOptions(),
  });
}
