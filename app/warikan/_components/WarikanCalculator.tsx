"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Check, Copy, MessageCircle, RotateCcw, Share2 } from "lucide-react";
import { SegmentedControl, type SegmentedOption } from "@/components/ui";
import { trackEvent } from "@/lib/analytics/events";
import {
  EMPTY_WARIKAN_INPUT,
  buildWarikanQuery,
  buildWarikanShareText,
  computeWarikan,
  formatYen,
  lineShareUrl,
  parseWarikanQuery,
  type DriverMode,
  type RoundingUnit,
  type TripMode,
  type WarikanField,
  type WarikanInput,
} from "@/lib/warikanPage";

const TRIP_OPTIONS: readonly SegmentedOption<TripMode>[] = [
  { value: "oneway", label: "片道" },
  { value: "round", label: "往復" },
];
const DRIVER_OPTIONS: readonly SegmentedOption<DriverMode>[] = [
  { value: "all", label: "全員で均等" },
  { value: "exclude", label: "運転手は払わない" },
];
const ROUNDING_OPTIONS: readonly SegmentedOption<"1" | "10" | "100">[] = [
  { value: "1", label: "1円単位" },
  { value: "10", label: "10円単位" },
  { value: "100", label: "100円単位" },
];

type FieldDef = {
  field: WarikanField;
  label: string;
  unit: string;
  placeholder: string;
  hint: string;
  inputMode: "decimal" | "numeric";
};

const FIELDS: Record<WarikanField, FieldDef> = {
  distance: { field: "distance", label: "走行距離", unit: "km", placeholder: "例: 150", hint: "目的地までの片道の距離", inputMode: "decimal" },
  efficiency: { field: "efficiency", label: "燃費", unit: "km/L", placeholder: "例: 15", hint: "車の実燃費の目安", inputMode: "decimal" },
  price: { field: "price", label: "ガソリン単価", unit: "円/L", placeholder: "例: 170", hint: "1L あたりの価格", inputMode: "decimal" },
  toll: { field: "toll", label: "高速代など（任意）", unit: "円", placeholder: "例: 4000", hint: "高速代・駐車場代など。往復分の合計", inputMode: "numeric" },
  people: { field: "people", label: "人数", unit: "人", placeholder: "例: 4", hint: "運転手を含めた乗っている人数", inputMode: "numeric" },
};

type CopyState = "copied" | "failed" | null;

/** ガソリン代の割り勘の計算機。入力は state と URL のクエリにだけ持ち、サーバーには送らない */
export default function WarikanCalculator() {
  const [input, setInput] = useState<WarikanInput>(EMPTY_WARIKAN_INPUT);
  /** 共有リンク（クエリ付き）で開かれた。結果を入力欄より上に出す */
  const [fromShare, setFromShare] = useState(false);
  /** マウント後に分かる値（静的ページなのでサーバーでは読めない） */
  const [origin, setOrigin] = useState("");
  const [canNativeShare, setCanNativeShare] = useState(false);
  const [copyState, setCopyState] = useState<CopyState>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const baseId = useId();
  const distanceId = `${baseId}-distance`;

  useEffect(() => {
    const shared = parseWarikanQuery(window.location.search);
    /* eslint-disable react-hooks/set-state-in-effect -- URL と端末の機能はサーバーで読めないため、マウント後に一度だけ反映する */
    if (shared) {
      setInput(shared);
      setFromShare(true);
    }
    setOrigin(window.location.origin);
    setCanNativeShare(typeof navigator.share === "function");
    /* eslint-enable react-hooks/set-state-in-effect */
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  /** 入力を変えたら URL のクエリも置き換える（履歴は増やさない）。マウント時は触らない（utm_* などを消さないため） */
  const update = (patch: Partial<WarikanInput>) => {
    const next = { ...input, ...patch };
    setInput(next);
    const nextQuery = buildWarikanQuery(next);
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}${window.location.hash}`
    );
    setCopyState(null);
  };

  const result = computeWarikan(input);
  const query = buildWarikanQuery(input);
  const shareUrl = origin && query ? `${origin}${window.location.pathname}?${query}` : null;
  const shareText = buildWarikanShareText(input, result);
  const isEmpty = query === "" && input.trip === EMPTY_WARIKAN_INPUT.trip && input.driver === "all" && input.rounding === 100;

  const showCopyState = (state: CopyState) => {
    setCopyState(state);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopyState(null), 2500);
  };

  const onNativeShare = async () => {
    if (!shareUrl || !shareText) return;
    trackEvent("warikan_share", { method: "native" });
    try {
      await navigator.share({ title: "ガソリン代の割り勘", text: shareText, url: shareUrl });
    } catch (err) {
      // 利用者が閉じたとき（AbortError）は何も出さない
      if (!(err instanceof DOMException && err.name === "AbortError")) console.error("共有できませんでした", err);
    }
  };

  const onCopy = async () => {
    if (!shareUrl || !shareText) return;
    trackEvent("warikan_share", { method: "copy" });
    try {
      await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
      showCopyState("copied");
    } catch (err) {
      console.error("コピーできませんでした", err);
      showCopyState("failed");
    }
  };

  const recalc = () => {
    setFromShare(false);
    // 結果が入力欄の下へ移ったあとで、最初の入力欄へ移る
    requestAnimationFrame(() => {
      const el = document.getElementById(distanceId);
      el?.scrollIntoView({ block: "center" });
      el?.focus({ preventScroll: true });
    });
  };

  const renderField = ({ field, label, unit, placeholder, hint, inputMode }: FieldDef) => {
    const id = `${baseId}-${field}`;
    const error = result.errors[field];
    return (
      <div key={field} className="min-w-0">
        <label htmlFor={id} className="block text-sm font-medium text-ink">
          {label}
        </label>
        <div className="relative mt-1.5">
          <input
            id={id}
            type="text"
            inputMode={inputMode}
            autoComplete="off"
            placeholder={placeholder}
            value={input[field]}
            onChange={(e) => update({ [field]: e.target.value })}
            aria-invalid={error ? true : undefined}
            aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`}
            className={`num h-11 w-full min-w-0 rounded-xl border bg-ground pl-3 pr-12 text-base text-ink placeholder:text-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              error ? "border-red-500" : "border-border"
            }`}
          />
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[13px] text-sub">{unit}</span>
        </div>
        <p id={`${id}-hint`} className="mt-1 text-xs leading-relaxed text-sub">
          {hint}
        </p>
        {error && (
          <p id={`${id}-error`} className="mt-1 text-xs text-red-400">
            {error}
          </p>
        )}
      </div>
    );
  };

  const roundingLabel = input.rounding === 1 ? "1 円未満" : `${input.rounding} 円未満`;

  const resultBlock = (
    <div aria-live="polite">
      <div className="rounded-2xl border border-line bg-ground px-4 py-4">
        <p className="text-[13px] text-sub">1 人あたり</p>
        <p className="mt-1 flex items-baseline gap-1">
          <span className={`num text-3xl font-bold ${result.perPerson != null ? "text-money" : "text-faint"}`}>
            {result.perPerson != null ? formatYen(result.perPerson) : "--"}
          </span>
          <span className="text-[13px] text-sub">円</span>
        </p>
        {result.perPerson != null && result.payers != null && (
          <p className="mt-1 text-xs leading-relaxed text-sub">
            合計を <span className="num">{result.payers}</span> 人で割り、{roundingLabel}を切り上げ
            {input.driver === "exclude" ? "（運転手は払わない）" : "（全員で均等）"}。集めると{" "}
            <span className="num text-ink">{formatYen(result.collected ?? 0)}</span> 円
            {result.collected != null && result.total != null && result.collected > result.total
              ? `（合計より ${formatYen(result.collected - result.total)} 円多い）`
              : ""}
          </p>
        )}
      </div>
      <dl className="mt-3 grid grid-cols-1 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-ground sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        <ResultItem label={input.trip === "round" ? "ガソリン代（往復）" : "ガソリン代（片道）"} value={result.fuelCost} />
        <ResultItem label="合計（ガソリン代＋高速代など）" value={result.total} />
      </dl>

      {result.perPerson != null && shareUrl && shareText && (
        <div className="mt-4">
          <p className="text-sm font-medium text-ink">結果を同乗者に送る</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {canNativeShare && (
              <button type="button" onClick={onNativeShare} className={SHARE_BUTTON}>
                <Share2 className="h-4 w-4" aria-hidden="true" />
                共有する
              </button>
            )}
            <a
              href={lineShareUrl(shareUrl)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackEvent("warikan_share", { method: "line" })}
              className={SHARE_BUTTON}
            >
              <MessageCircle className="h-4 w-4" aria-hidden="true" />
              LINE で送る
            </a>
            <button type="button" onClick={onCopy} className={SHARE_BUTTON}>
              {copyState === "copied" ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
              リンクをコピー
            </button>
            <span role="status" className="text-xs text-sub">
              {copyState === "copied" ? "コピーしました" : copyState === "failed" ? "コピーできませんでした" : ""}
            </span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-sub">
            送る文面: {shareText}（リンクを開くと同じ入力と結果が出ます）
          </p>
        </div>
      )}
    </div>
  );

  return (
    <div className="rounded-hero border border-line bg-surface p-4 sm:p-6">
      {fromShare && (
        <div className="mb-5">
          <p className="mb-2 text-sm font-bold text-ink">送られてきた計算結果</p>
          {resultBlock}
          <button
            type="button"
            onClick={recalc}
            className="mt-3 inline-flex h-11 items-center gap-1.5 rounded-xl border border-border bg-surface-2 px-4 text-sm font-bold text-ink transition-colors hover:bg-line focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            自分で計算し直す
          </button>
          <p className="mt-2 text-xs text-sub">下の入力欄を変えると、結果もすぐに変わります。</p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {renderField(FIELDS.distance)}
        {renderField(FIELDS.efficiency)}
        {renderField(FIELDS.price)}
      </div>
      <div className="mt-4">
        <p className="text-sm font-medium text-ink">片道・往復</p>
        <SegmentedControl
          aria-label="片道・往復"
          options={TRIP_OPTIONS}
          value={input.trip}
          onChange={(trip) => update({ trip })}
          className="mt-1.5 border border-border bg-ground! sm:max-w-xs"
        />
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {renderField(FIELDS.toll)}
        {renderField(FIELDS.people)}
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">運転手の分</p>
          <SegmentedControl
            aria-label="運転手の分"
            options={DRIVER_OPTIONS}
            value={input.driver}
            onChange={(driver) => update({ driver })}
            className="mt-1.5 border border-border bg-ground!"
          />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">1 人あたりの端数</p>
          <SegmentedControl
            aria-label="1 人あたりの端数"
            options={ROUNDING_OPTIONS}
            value={String(input.rounding) as "1" | "10" | "100"}
            onChange={(value) => update({ rounding: Number(value) as RoundingUnit })}
            className="mt-1.5 border border-border bg-ground!"
          />
          <p className="mt-1 text-xs leading-relaxed text-sub">選んだ単位で切り上げます（集めた額が足りなくならないように）</p>
        </div>
      </div>

      {!fromShare && <div className="mt-5">{resultBlock}</div>}

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-xs text-sub">入力した値は保存されません。</p>
        <button
          type="button"
          onClick={() => {
            setFromShare(false);
            update(EMPTY_WARIKAN_INPUT);
          }}
          disabled={isEmpty}
          className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-border bg-surface-2 px-4 text-sm font-bold text-ink transition-colors hover:bg-line focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          リセット
        </button>
      </div>
    </div>
  );
}

const SHARE_BUTTON =
  "inline-flex h-11 items-center gap-1.5 rounded-xl border border-border bg-surface-2 px-4 text-sm font-bold text-ink transition-colors hover:bg-line focus:outline-none focus-visible:ring-2 focus-visible:ring-accent";

function ResultItem({ label, value }: { label: string; value: number | null }): ReactNode {
  return (
    <div className="flex items-baseline justify-between gap-3 px-4 py-3 sm:block">
      <dt className="text-[13px] text-sub">{label}</dt>
      <dd className="flex items-baseline gap-1 sm:mt-1">
        <span className={`num text-xl font-bold ${value != null ? "text-money" : "text-faint"}`}>
          {value != null ? formatYen(value) : "--"}
        </span>
        <span className="text-[13px] text-sub">円</span>
      </dd>
    </div>
  );
}
