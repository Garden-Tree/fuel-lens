"use client";

import { useId } from "react";
import { SignInButton } from "@clerk/nextjs";
import { LogIn } from "lucide-react";
import { TRIAL_MAX_SCANS } from "@/lib/trial";
import { trackEvent } from "@/lib/analytics/events";

export type TrialLoginPromptProps = {
  onDismiss: () => void;
};

const BUTTON =
  "inline-flex h-11 items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent";

/** ログイン後に何が起きるか（lib/migrateLocalData.ts・lib/data/cloudStore.ts の実際の動作だけを書く） */
export const TRIAL_LOGIN_BENEFITS =
  "ログインすると、AIスキャンを続けて使えます。記録はクラウドに保存され、ほかの端末からも見られます。このブラウザに保存した記録は、ログインしたときに自動でアカウントへ移されます。";

/**
 * 未ログインでお試し読み取り（3 回）を使い切ったときに、ホームの上に出すログインの案内。
 * ログインはヘッダーと同じ Clerk のモーダル（SignInButton）。「閉じる」でこの表示中は消える（表示の制御は app/(app)/app/page.tsx）。
 */
export default function TrialLoginPrompt({ onDismiss }: TrialLoginPromptProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex w-full flex-col gap-3 rounded-hero border border-accent/40 bg-surface p-4">
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="text-[15px] font-bold text-ink">
          お試しの読み取り（{TRIAL_MAX_SCANS}回）を使い切りました
        </h2>
        <p className="text-xs leading-relaxed text-sub">{TRIAL_LOGIN_BENEFITS}</p>
        <p className="text-xs leading-relaxed text-sub">手動入力はログインなしでも続けて使えます。</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <SignInButton mode="modal" forceRedirectUrl="/app">
          {/* SignInButton は子の onClick も呼んでからモーダルを開く。計測（GA4）だけを送る */}
          <button
            type="button"
            onClick={() => trackEvent("sign_up_prompt_click", { prompt: "trial_exhausted" })}
            className={`${BUTTON} bg-scan-gradient text-white`}
          >
            <LogIn className="h-4 w-4" aria-hidden="true" />
            ログインして続ける
          </button>
        </SignInButton>
        <button type="button" onClick={onDismiss} className={`${BUTTON} text-sub hover:bg-surface-2 hover:text-ink`}>
          閉じる
        </button>
      </div>
    </section>
  );
}
