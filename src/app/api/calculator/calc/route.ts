import { calcItem, getProducts } from "@/lib/calculator/engine";
import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, err } from "@/lib/bff/response";
import { z } from "zod";

const CalcSchema = z.object({
  productId: z.string().min(1),
  width:     z.number(),
  height:    z.number(),
  panels:    z.number().int().positive().optional().default(1),
  options:   z.object({
    glassIndex: z.number().optional(),
    colorIndex: z.number().optional(),
    tiltTurn:   z.boolean().optional(),
    beam:       z.boolean().optional(),
    motor:      z.enum(["80", "300"]).optional(),
    closer:     z.number().optional(),
  }).optional().default({}),
});

export const POST = withRoute(async (req: Request) => {
  const ctx = await requirePermission("calculator", "write");

  const body = await req.json().catch(() => null);
  const parsed = CalcSchema.safeParse(body);
  if (!parsed.success) return err("ข้อมูลไม่ถูกต้อง", 422, parsed.error.flatten());

  const { productId, width, height, panels, options } = parsed.data;
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

  // cost และ profit เฉพาะ ADMIN เท่านั้น (ราคาทุน/กำไรต้องกัน)
  if (ctx.role === "ADMIN") {
    response.cost = result.cost;
    response.profit = result.cost !== null && result.sell > 0
      ? Math.round(((result.sell - result.cost) / result.sell) * 100)
      : null;
  }

  return ok(response);
});
