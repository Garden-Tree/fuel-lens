import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/keepalive
 *
 * Supabase Free プランの「約 7 日間アクセスが無いとプロジェクトが一時停止される」
 * 仕様への対策エンドポイント。Vercel Cron (vercel.json) から 1 日 1 回呼ばれ、
 * DB に対して以下の軽いアクセスを行う。
 *
 *   1. rpc keepalive_ping()          … ハートビート行を更新 (書き込み)
 *   2. vehicles / fuel_records の件数 … head リクエスト (読み取り)
 *
 * 認証: `Authorization: Bearer <CRON_SECRET>` が必須。
 *   Vercel は CRON_SECRET 環境変数が設定されていると Cron 実行時に自動でこのヘッダーを付与する。
 *   CRON_SECRET が未設定の場合は 500 を返し、誤って公開エンドポイントにならないようにする。
 *
 * 注意: lib/ 配下のクライアントは使わない (ブラウザ用の設定のため)。
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** タイミング攻撃対策付きの文字列比較 */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

type CountResult = {
  count: number | null;
  error: string | null;
};

export async function GET(request: Request) {
  // --- 1. 認証 ---------------------------------------------------------------
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[keepalive] CRON_SECRET が設定されていません");
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET is not configured" },
      { status: 500 },
    );
  }

  const authHeader = request.headers.get("authorization") ?? "";
  if (!safeEqual(authHeader, `Bearer ${cronSecret}`)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // --- 2. Supabase クライアント --------------------------------------------
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // service_role キーがあれば RLS を迂回して件数取得も行える。
  // 無ければ anon キーにフォールバック (この場合 rpc のみ成功し、件数取得は権限エラーになる)。
  // 空文字の環境変数もフォールバックさせるため `??` ではなく `||` を使う
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || undefined;
  const supabaseKey = serviceRoleKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("[keepalive] Supabase の環境変数が不足しています");
    return NextResponse.json(
      { ok: false, error: "Supabase env vars are not configured" },
      { status: 500 },
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const startedAt = Date.now();

  // --- 3. ハートビート更新 (必須) -------------------------------------------
  const ping = await supabase.rpc("keepalive_ping", { p_source: "vercel-cron" });

  if (ping.error) {
    // プロジェクトが一時停止中だとゲートウェイが HTTP 540 を返す
    const paused = ping.status === 540;
    const upstreamFailure = ping.status === 0 || ping.status >= 500;
    console.error("[keepalive] keepalive_ping に失敗:", {
      status: ping.status,
      code: ping.error.code,
      message: ping.error.message,
    });
    return NextResponse.json(
      {
        ok: false,
        paused,
        status: ping.status,
        error: ping.error.message,
        code: ping.error.code,
      },
      { status: paused || upstreamFailure ? 503 : 502 },
    );
  }

  // --- 4. 件数取得 (補助的。失敗しても keepalive 自体は成功扱い) -----------
  const [vehicles, fuelRecords] = await Promise.all([
    supabase.from("vehicles").select("*", { head: true, count: "exact" }),
    supabase.from("fuel_records").select("*", { head: true, count: "exact" }),
  ]);

  const toCountResult = (res: { count: number | null; error: { message: string } | null }): CountResult => ({
    count: res.error ? null : res.count,
    error: res.error ? res.error.message : null,
  });

  const counts = {
    vehicles: toCountResult(vehicles),
    fuel_records: toCountResult(fuelRecords),
  };

  if (counts.vehicles.error || counts.fuel_records.error) {
    // anon キーでの実行時は revoke により権限エラーになる (想定内)
    console.warn("[keepalive] 件数取得に失敗 (keepalive 自体は成功):", counts);
  }

  return NextResponse.json({
    ok: true,
    paused: false,
    last_ping: ping.data,
    key: serviceRoleKey ? "service_role" : "anon",
    counts,
    elapsed_ms: Date.now() - startedAt,
  });
}
