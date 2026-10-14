"use client";

import { useState } from "react";
import { useClerk } from "@clerk/nextjs";
import { Loader2, Trash2, UserX } from "lucide-react";

import { BACKUP_SECTION_ID } from "@/components/BackupPanel";
import {
  captionClass,
  dangerButtonClass,
  inputClass,
  noticeClass,
  panelClass,
  secondaryButtonClass,
  type SettingsBusy,
} from "@/components/settingsUi";
import { useToast } from "@/components/Toast";
import { GroupedList, ListRow, Section } from "@/components/ui";
import { useDataStores } from "@/lib/data/useDataStores";
import { notifyRecordsChanged, notifyVehiclesChanged } from "@/lib/events";
import { errorText } from "@/lib/restore";

/** 確認のために入力してもらう語 */
export const DELETE_CONFIRM_WORD = "削除";

/** 削除の後に移る先。ランディングが一度だけ「削除しました」を出す（components/landing/AccountDeletedNotice.tsx） */
export const ACCOUNT_DELETED_URL = "/?deleted=1";

export interface AccountPanelProps {
  /** 閲覧専用（クラウド障害中）。アカウント削除を無効にする */
  readOnly: boolean;
  /** 設定画面で共有する処理中フラグ（バックアップ・復元・取り込みと同時に動かさない） */
  busy: string | null;
  setBusy: (busy: SettingsBusy | null) => void;
  /** 未ログイン時にこの端末のデータを削除した後に呼ぶ（設定画面がデータ概要を読み込み直す） */
  onLocalCleared?: () => void;
}

/** /api/account の失敗を日本語のメッセージにする（サーバーの本文は日本語の汎用メッセージと requestId だけ） */
async function apiFailureDetail(res: Response): Promise<string> {
  try {
    const body: unknown = await res.json();
    const requestId = (body as { requestId?: unknown } | null)?.requestId;
    if (typeof requestId === "string" && requestId) return `（エラーID: ${requestId}）`;
  } catch {
    // 本文が JSON でない（プロキシのエラーなど）
  }
  return `（HTTP ${res.status}）`;
}

/**
 * 設定画面の「アカウント」。
 * - ログイン中: アカウント削除。確認ダイアログ → 「削除」と入力 → (1) クラウドのデータを削除（RLS。lib/data/accountDeletion.ts）
 *   → (2) DELETE /api/account（Clerk のユーザーを削除）→ (3) ログアウトして /?deleted=1 へ。
 *   (1) の後で (2) が失敗したら、データは削除済みでアカウントが残っていることを伝え、再試行で (1)（冪等）と (2) をやり直す。
 * - 未ログイン: アカウントが無いので、この端末のデータ（localStorage）を削除する操作だけを出す。
 */
export default function AccountPanel({ readOnly, busy, setBusy, onLocalCleared }: AccountPanelProps) {
  const { toast, confirm } = useToast();
  const { signOut } = useClerk();
  const { isLoaded, stores } = useDataStores();

  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  // (1) が成功したか（(2) の失敗時の案内に使う）
  const [dataDeleted, setDataDeleted] = useState(false);

  if (!isLoaded || !stores) return null;

  const deleting = busy === "account-delete";

  if (stores.kind === "local") {
    const handleClearLocal = async () => {
      if (busy !== null) return;
      const ok = await confirm(
        "この端末（ブラウザ）に保存されている車両と給油記録をすべて削除します。\n元に戻せません。必要なら先にバックアップしてください。",
        { title: "この端末のデータを削除", confirmLabel: "削除する", danger: true }
      );
      if (!ok) return;
      setBusy("local-clear");
      try {
        await stores.clearAll();
        notifyVehiclesChanged();
        notifyRecordsChanged();
        onLocalCleared?.();
        toast("この端末のデータを削除しました", { type: "success" });
      } catch (e) {
        console.error(e);
        toast(errorText(e, "この端末のデータを削除できませんでした。"), { type: "error" });
      } finally {
        setBusy(null);
      }
    };

    return (
      <Section title="アカウント">
        <GroupedList>
          <ListRow
            leading={<Trash2 className="h-5 w-5 text-red-400" aria-hidden="true" />}
            title={<span className="text-red-400">この端末のデータをすべて削除</span>}
            trailing={busy === "local-clear" ? <Loader2 className="h-4 w-4 animate-spin text-sub" aria-hidden="true" /> : undefined}
            onClick={handleClearLocal}
            disabled={busy !== null}
          />
        </GroupedList>
        <p className={captionClass}>
          ログインしていないため、データは端末内だけにあります。ブラウザの保存データを消すと削除されます。
        </p>
      </Section>
    );
  }

  const cloud = stores;
  const confirmed = typed.trim() === DELETE_CONFIRM_WORD;

  const handleStart = async () => {
    if (busy !== null || readOnly) return;
    const ok = await confirm(
      "アカウントと、クラウドに保存したすべての車両・給油記録を完全に削除します。\n" +
        "削除したデータとアカウントは元に戻せません。必要なら先に「バックアップ」から JSON を書き出してください。",
      { title: "アカウントを削除", confirmLabel: "次へ", danger: true }
    );
    if (!ok) return;
    setTyped("");
    setError(null);
    setTyping(true);
  };

  const handleCancel = () => {
    setTyping(false);
    setTyped("");
    setError(null);
  };

  const handleDelete = async () => {
    if (!confirmed || busy !== null || readOnly) return;
    setBusy("account-delete");
    setError(null);
    let dataDone = false;
    try {
      // (1) クラウドのデータ（冪等。再試行で戻ってきたときも、その間に作られた既定車両などを消し直す）
      await cloud.deleteAccountData();
      dataDone = true;
      setDataDeleted(true);
      // (2) Clerk のユーザー
      let res: Response;
      try {
        res = await fetch("/api/account", { method: "DELETE", headers: { Accept: "application/json" } });
      } catch (e) {
        console.error("アカウント削除 API に接続できませんでした:", e);
        throw new Error("（通信エラー）");
      }
      if (!res.ok) throw new Error(await apiFailureDetail(res));
    } catch (e) {
      const message = dataDone
        ? `記録と車両は削除しましたが、アカウントを削除できませんでした${errorText(e, "")}。もう一度「完全に削除する」を押してください。`
        : errorText(e, "データを削除できませんでした。時間をおいて、もう一度お試しください。");
      if (!dataDone) console.error("アカウントのデータの削除に失敗しました:", e);
      setError(message);
      toast(message, { type: "error" });
      setBusy(null);
      return;
    }

    // (3) ログアウトしてランディングへ（Clerk 側のセッションは削除済みなので、ログアウトが失敗しても移動する）
    try {
      await signOut({ redirectUrl: ACCOUNT_DELETED_URL });
    } catch (e) {
      console.error("ログアウトに失敗しました:", e);
      // Clerk の状態ごと読み込み直すため、クライアント側の遷移ではなくページを読み込み直す
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(ACCOUNT_DELETED_URL);
    }
  };

  return (
    <Section title="アカウント">
      <GroupedList>
        <ListRow
          leading={<UserX className="h-5 w-5 text-red-400" aria-hidden="true" />}
          title={<span className="text-red-400">アカウントを削除</span>}
          subtitle="アカウントと、クラウドのすべての車両・記録を削除します"
          wrapSubtitle
          onClick={handleStart}
          disabled={busy !== null || readOnly || typing}
        />

        {typing && (
          <div className={panelClass}>
            <p className="text-xs leading-relaxed text-ink">
              削除すると元に戻せません。必要なら先に{" "}
              <a href={`#${BACKUP_SECTION_ID}`} className="text-accent underline underline-offset-2">
                バックアップ
              </a>{" "}
              してください。
            </p>
            <label htmlFor="account-delete-confirm" className="mt-3 block text-xs text-sub">
              確認のため「{DELETE_CONFIRM_WORD}」と入力してください
            </label>
            <input
              id="account-delete-confirm"
              type="text"
              value={typed}
              onChange={e => setTyped(e.target.value)}
              autoComplete="off"
              disabled={deleting}
              className={`${inputClass} mt-1.5`}
            />
            {error && (
              <p role="alert" className="mt-3 break-words text-xs leading-relaxed text-red-400">
                {error}
              </p>
            )}
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleDelete}
                disabled={!confirmed || busy !== null || readOnly}
                className={dangerButtonClass}
              >
                {deleting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                完全に削除する
              </button>
              <button type="button" onClick={handleCancel} disabled={deleting} className={secondaryButtonClass}>
                キャンセル
              </button>
            </div>
          </div>
        )}
      </GroupedList>
      {dataDeleted && !deleting && error && (
        <p className={noticeClass}>記録と車両は削除済みです。アカウントだけが残っています。</p>
      )}
      {readOnly && (
        <p role="status" className="px-4 text-[11px] text-warn">
          閲覧専用（クラウド接続待ち）のため削除できません
        </p>
      )}
    </Section>
  );
}
