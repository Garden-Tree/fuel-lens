"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";

/** 共有トークン（?t=）や記録 ID（#record-）を送らないよう、パスだけにして送る */
function stripQueryAndHash(event: BeforeSendEvent): BeforeSendEvent {
  try {
    const url = new URL(event.url);
    url.search = "";
    url.hash = "";
    return { ...event, url: url.toString() };
  } catch {
    return event;
  }
}

/** Vercel Web Analytics（ページビューのみ）。関数の props を渡すため Client Component で包む */
export default function WebAnalytics() {
  return <Analytics beforeSend={stripQueryAndHash} />;
}
