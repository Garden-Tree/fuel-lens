"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";
import { scrubAnalyticsUrl } from "@/lib/analytics/scrubUrl";

/** 共有トークン（?t=）や記録 ID（#record-）は送らず、utm_* だけ残して送る（lib/analytics/scrubUrl.ts） */
function scrub(event: BeforeSendEvent): BeforeSendEvent | null {
  const url = scrubAnalyticsUrl(event.url);
  return url ? { ...event, url } : null;
}

/** Vercel Web Analytics（ページビューのみ）。関数の props を渡すため Client Component で包む */
export default function WebAnalytics() {
  return <Analytics beforeSend={scrub} />;
}
