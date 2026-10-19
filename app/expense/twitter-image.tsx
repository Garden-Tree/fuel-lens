import { renderToolOgImage } from "@/lib/og/renderToolOgImage";
import { EXPENSE_OG_ALT, EXPENSE_OG_CONTENT } from "@/lib/og/expenseOg";

export const alt = EXPENSE_OG_ALT;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";

export default async function Image() {
  return renderToolOgImage(EXPENSE_OG_CONTENT);
}
