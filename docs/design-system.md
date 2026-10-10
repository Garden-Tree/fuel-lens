# デザインシステム

FuelLens の画面は「計器盤のようなダーク UI ＋ グループリスト」で統一します（デザイン案 D）。
スマホ（390px 前後）を基準にし、PC は同じ部品を広い画面向けに並べ直します。

## トークン

`app/globals.css` の `@theme` に定義しています。Tailwind のクラス（`bg-surface`・`text-sub`・`border-line` など）で使い、16 進の色を直接書かないこと。

| トークン | 値 | 用途 |
|---|---|---|
| `ground` | `#0B0F14` | 画面の地（body） |
| `surface` | `#131A22` | カード・グループリスト |
| `surface-2` | `#1A232E` | チップ・押下中の行・選択中のナビ |
| `line` | `#1F2934` | 行の区切り線 |
| `border` | `#253140` | 操作部品の枠線（`border-border`） |
| `ink` | `#E8EDF3` | 主要な文字 |
| `sub` | `#8C99A8` | 補足の文字・見出しラベル |
| `faint` | `#4C5968` | シェブロン・無効 |
| `accent` | `#3AA0FF` | 選択中のタブ・リンク・メーター |
| `accent-strong` | `#23426B` | 選択中のセグメントの背景 |
| `money` / `money-dim` | `#34D399` / `#2B9C74` | 金額 |
| `up` / `up-bg` | `#5EE0AE` / 緑 12% | 良い変化（燃費の向上） |
| `cost-up` | `#FF9F7A` | 単価の上昇・平均の破線 |
| `warn` / `warn-bg` | `#FFC56E` / 橙 14% | 部分給油バッジ・注意・障害バナー |
| 危険 | Tailwind の `red-400` / `red-500` / `red-600` | エラー・削除 |

角丸: グループリスト 16px（`rounded-2xl`）、ヒーローカード・シート・ダイアログ 20px（`rounded-hero`）、操作部品 12px（`rounded-xl`）、チップは高さ 40px の `rounded-full`。

グラデーション `bg-scan-gradient`（`#2F7BFF → #19C3E6`）は**スキャン（撮影）ボタンだけ**に使います。カードの光彩・装飾のグラデーションは使いません。

## 文字

- 本文は Noto Sans JP（400 / 500 / 700）、数字は JetBrains Mono（`app/layout.tsx` の next/font）。
- **金額・燃費・距離・給油量などの数値は `num` ユーティリティ**（等幅・`tabular-nums`）で表示します。部品なら `<Num>`。
- 見出し: ページ見出し 20px 太字、セクション見出し 13px `text-sub` 中太（左右 16px）、行の本文 15px、補足 12〜13px `text-sub`。
- UI の文言はすべて日本語（CLAUDE.md の不変条件 6）。

## 部品（`components/ui/`）

`import { Section, GroupedList, ListRow, ValueRow } from "@/components/ui";`

| 部品 | 用途 |
|---|---|
| `Section` | 小見出し（`title`）と右側の `action`（「すべて見る」など）＋中身 |
| `GroupedList` | 角丸 16px の面。直下の行の間に区切り線を引く |
| `ListRow` | 行（最小 46px）。`href` なら Link、`onClick` なら button、無ければ div。`leading` / `title` / `subtitle` / `trailing` / `showChevron` |
| `ValueRow` | 左にラベル、右に値（`num` 太字）。`unit` と `tone`（`money` / `up` / `cost-up` など） |
| `SegmentedControl` | 期間などの切り替え（role="group"、aria-pressed、高さ 40px） |
| `Chip` | 絞り込み・メニューを開くチップ（高さ 40px、`showChevron`） |
| `IconButton` | 40×40 の丸いアイコンボタン（`aria-label` 必須） |
| `Menu` / `MenuItem` | チップから開くドロップダウン（キーボード操作・外側クリックで閉じる）。`checked` で単一選択 |
| `Num` | 数値の span |
| `BrandMark` | ロゴ（給油機アイコン）とワードマーク |

モーダルは `components/Modal.tsx`、通知と確認は `useToast()`（`components/Toast.tsx`）を使います（`alert` / `confirm` は使わない）。

## ナビゲーション

アプリ画面（/app・/history・/stats・/settings）は最上位を `AppFrame`（`components/AppShell.tsx`）で包みます。ランディング（/）では使いません。

```tsx
<AppFrame>                       {/* 設定画面のような 1 カラムは width="narrow" */}
  <PageHeader title="給油履歴" rightSlot={<VehicleSelector ... />} />
  ...
</AppFrame>
```

- **スマホ（< lg）**: 画面下の固定タブバー（ホーム / 履歴 / 中央のスキャンボタン / 統計 / 設定）。高さ 56px ＋ safe-area。
  選択中はアクセント色・太字。本文の下にはタブバー分の余白を AppFrame が空けます。
- **PC（≥ lg）**: 左に幅 240px のサイドバー（ロゴ・4 項目・「スキャンして記録」・ログイン / ユーザーボタン）。本文は最大 1040px・余白 32px で中央に置きます。
- スキャンボタンは `ScanActionMenu`（撮影する / アルバムから選ぶ / 手動で入力）を開きます。スマホはボトムシート、PC はボタン直下のポップオーバー。
  各項目は `/app?action=scan|album|manual` に遷移し、/app の `useShortcutActions` が実行します（未ログインでは AI スキャンを無効にし、手動入力だけ選べます）。
- `PageHeader` は左に見出し、右に車両チップ（`VehicleSelector`）。/app のスマホ表示は見出しの代わりにロゴ（`brand`）。スマホではログイン / ユーザーボタンもヘッダー右端に置きます。

## ルール

- 色・角丸はトークンを使う。グラデーションはスキャンボタンだけ。
- 数値は `num`。単位（km/L・円・L）は小さく `text-sub` で添える。
- タッチ領域は 40px 以上（44px 推奨）。アイコンだけのボタンには日本語の `aria-label` を付ける。
- 行の区切りは `divide-line`、操作部品の枠は `border-border`。
- スマホは 1 カラム・左右 16px。PC は同じ部品を 2 カラムなどに並べ直す（別デザインにはしない）。
- 横スクロールを出さない（長い名前は `truncate`）。
