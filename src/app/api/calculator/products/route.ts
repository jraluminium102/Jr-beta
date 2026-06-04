import { getProducts, getGlassOptions, getColorOptions } from "@/lib/calculator/engine";
import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";

// GET /api/calculator/products — ดึงรายการสินค้า/กระจก/สี สำหรับเครื่องคิดราคา
export const GET = withRoute(async () => {
  await requirePermission("calculator", "read");

  return ok({
    products: getProducts(),
    glass: getGlassOptions(),
    colors: getColorOptions(),
  });
});
