import { NextRequest, NextResponse } from "next/server";
import { calcItem, getProducts } from "@/lib/calculator/engine";
import { getProfile } from "@/lib/auth";

export async function POST(req: NextRequest) {
  // auth
  const profile = await getProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    productId: string;
    width: number;
    height: number;
    panels?: number;
    options?: {
      glassIndex?: number;
      colorIndex?: number;
      tiltTurn?: boolean;
      beam?: boolean;
      motor?: "80" | "300";
      closer?: number;
    };
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { productId, width, height, panels = 1, options = {} } = body;

  if (!productId || typeof width !== "number" || typeof height !== "number") {
    return NextResponse.json({ error: "productId, width, height required" }, { status: 400 });
  }

  const result = calcItem(productId, width, height, panels, options);

  // หา product name สำหรับ lineItem
  const products = getProducts();
  const prod = products.find((p) => p.id === productId);

  const response: {
    sell: number;
    area: number;
    msgs: string[];
    addonLabel: string;
    lineItem: { productId: string; productName: string; width: number; height: number; panels: number; sell: number };
    cost?: number | null;
    profit?: number | null;
  } = {
    sell: result.sell,
    area: result.area,
    msgs: result.msgs,
    addonLabel: result.addonLabel,
    lineItem: {
      productId,
      productName: prod?.name ?? productId,
      width,
      height,
      panels,
      sell: result.sell,
    },
  };

  // cost และ profit เฉพาะ owner
  if (profile.role === "owner") {
    response.cost = result.cost;
    response.profit = result.cost !== null && result.sell > 0
      ? Math.round(((result.sell - result.cost) / result.sell) * 100)
      : null;
  }

  return NextResponse.json(response);
}
