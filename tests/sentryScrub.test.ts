import type { Breadcrumb, ErrorEvent } from "@sentry/nextjs";
import { describe, expect, it } from "vitest";
import { scrubBreadcrumb, scrubEvent, stripUrlQueryAndHash } from "@/lib/sentry/scrub";

const ev = (e: Partial<ErrorEvent>) => e as ErrorEvent;

describe("stripUrlQueryAndHash", () => {
  it("クエリとハッシュを落とす", () => {
    expect(stripUrlQueryAndHash("https://example.com/app?action=shared&t=secret")).toBe("https://example.com/app");
    expect(stripUrlQueryAndHash("https://example.com/history#record-abc")).toBe("https://example.com/history");
    expect(stripUrlQueryAndHash("/app?x=1#y")).toBe("/app");
  });
  it("クエリが無ければそのまま", () => {
    expect(stripUrlQueryAndHash("https://example.com/stats")).toBe("https://example.com/stats");
  });
});

describe("scrubEvent", () => {
  it("URL のクエリ・ハッシュ、query_string、cookies を除去する", () => {
    const out = scrubEvent(
      ev({
        request: {
          url: "https://example.com/app?action=shared&t=secret#record-1",
          query_string: "action=shared&t=secret",
          cookies: { a: "b" },
          headers: { "user-agent": "x" },
        },
      })
    );
    expect(out.request?.url).toBe("https://example.com/app");
    expect(out.request?.query_string).toBeUndefined();
    expect(out.request?.cookies).toBeUndefined();
    // /api/analyze 以外ではヘッダーは残す
    expect(out.request?.headers).toEqual({ "user-agent": "x" });
  });

  it("/api/analyze は本文とヘッダーを落とす", () => {
    const out = scrubEvent(
      ev({
        request: {
          url: "https://example.com/api/analyze?x=1",
          data: { image: "data:image/jpeg;base64,AAAA" },
          headers: { cookie: "s=1", origin: "https://example.com" },
        },
      })
    );
    expect(out.request?.url).toBe("https://example.com/api/analyze");
    expect(out.request?.data).toBeUndefined();
    expect(out.request?.headers).toBeUndefined();
  });

  it("ユーザーは ID だけ残す", () => {
    const out = scrubEvent(ev({ user: { id: "user_1", email: "a@example.com", ip_address: "1.2.3.4", username: "u" } }));
    expect(out.user).toEqual({ id: "user_1" });
    expect(scrubEvent(ev({ user: { email: "a@example.com" } })).user).toBeUndefined();
  });

  it("パンくずの URL も除去する", () => {
    const out = scrubEvent(
      ev({
        breadcrumbs: [
          { category: "fetch", data: { url: "/api/x?t=secret", method: "GET" } },
          { category: "navigation", data: { from: "/app?t=1", to: "/history#record-9" } },
        ],
      })
    );
    expect(out.breadcrumbs?.[0].data).toEqual({ url: "/api/x", method: "GET" });
    expect(out.breadcrumbs?.[1].data).toEqual({ from: "/app", to: "/history" });
  });

  it("request / user / breadcrumbs が無くても動く", () => {
    expect(scrubEvent(ev({ message: "x" }))).toEqual({ message: "x" });
  });
});

describe("scrubBreadcrumb", () => {
  it("data が無ければそのまま返す", () => {
    const b: Breadcrumb = { message: "hi" };
    expect(scrubBreadcrumb(b)).toBe(b);
  });
});
