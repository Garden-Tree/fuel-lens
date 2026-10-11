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

補足:

- `gray-550`（`#5B6472`）と `gray-850`（`#172033`）は、Tailwind 既定のグレースケールの中間色として `@theme` に足してあるだけで、現状はどこからも使っていません。
- 半透明の `bg-ground/80`・`bg-surface-2/60`・`text-ink/80` のような不透明度の指定は、トークンのままで使えます。

角丸: グループリスト 16px（`rounded-2xl`）、ヒーローカード・シート・ダイアログ 20px（`rounded-hero`。`--radius-hero`）、操作部品 12px（`rounded-xl`）、チップは高さ 40px の `rounded-full`。

グラデーション `bg-scan-gradient`（`#2F7BFF → #19C3E6`）は**スキャン（撮影）ボタンだけ**に使います。カードの光彩・装飾のグラデーションは使いません。

## 文字

- 本文は Noto Sans JP（400 / 500 / 700）、数字は JetBrains Mono（`app/layout.tsx` の next/font）。
- **金額・燃費・距離・給油量などの数値は `num` ユーティリティ**（等幅・`tabular-nums`）で表示します。部品なら `<Num>`。
- 見出し: ページ見出し 20px 太字、セクション見出し 13px `text-sub` 中太（左右 16px）、行の本文 15px、補足 12〜13px `text-sub`。
- UI の文言はすべて日本語（CLAUDE.md の不変条件 6）。

## 部品（`components/ui/`）

`import { Section, GroupedList, ListRow, ValueRow } from "@/components/ui";`

| 部品 | 用途・主な props |
|---|---|
| `Section` | 小見出し（`title`。既定で h2、`headingLevel` で 3 / `null`）と右側の `action`（「すべて見る」など）＋中身 |
| `GroupedList` | 角丸 16px・`bg-surface`・`overflow-hidden` の面。直下の行の間に区切り線を引く。`as="ul"` / `"ol"` のときは子を `<li>` で包む |
| `ListRow` | 行（最小 46px）。`href` なら Link、`onClick` なら button、無ければ div。`leading` / `title` / `subtitle` / `trailing` / `showChevron` / `disabled` / `aria-label` |
| `ValueRow` | 左にラベル、右に値（`num` 太字 16px）。`unit`（13px `text-sub` の単位・補足。要素も可）と `tone`（`default` / `money` / `accent` / `up` / `cost-up` / `warn` / `sub`） |
| `SegmentedControl` | 期間などの切り替え（role="group"、aria-pressed、高さ 40px）。`options` / `value` / `onChange` / `aria-label`（必須）/ `disabled` |
| `Chip` | 絞り込み・メニューを開くチップ（高さ 40px）。`showChevron` / `selected` / `icon` |
| `IconButton` | 40×40 の丸いアイコンボタン（`aria-label` 必須）。`variant`: `outline`（既定）/ `ghost` |
| `Menu` / `MenuItem` | チップから開くドロップダウン（キーボード操作・外側クリックで閉じる。下に入りきらない・スマホの下部タブバーに重なるときは上に開く。重なり順は `z-[45]` でタブバー（z-40）より上・モーダル（z-50）より下）。`Menu`: `label` / `trigger` / `triggerAriaLabel` / `align`（`start` / `end`）/ `disabled`。`MenuItem`: `onSelect` / `checked`（単一選択。`menuitemradio`）/ `icon` / `separated`（上に区切り線）/ `disabled` |
| `Num` | 数値の span（`num`） |
| `BrandMark` | ロゴ（給油機アイコン）とワードマーク。`showWordmark` |

モーダルは `components/Modal.tsx`、通知と確認は `useToast()`（`components/Toast.tsx`）を使います（`alert` / `confirm` は使わない）。

### 使うときの注意

- **`GroupedList` は `overflow-hidden`** なので、行の中でメニュー（`Menu`）やポップオーバーを開くと切れます。そういう行を並べる一覧は、同じ見た目の自前の `<ul className="rounded-2xl bg-surface divide-y divide-line">` にします（履歴の一覧がこれ）。
- **面の中の `SegmentedControl`**: 既定の背景は `bg-surface` なので、`bg-surface` のグループリストの中に置くと溶け込みます。その場合は `className="bg-ground!"` で背景を地の色にします（車両管理の「距離の入力方式」）。画面の地（`ground`）の上に直接置くなら既定のままで使えます（統計の期間フィルタ）。
- 入力フォーム・車両管理・設定のフォームは、グループリストの行と同じ幅・余白（左右 16px・最小の高さ 46〜56px）で組み、スイッチは `role="switch"` の自前の部品（`EditFuelRecordForm.tsx`）、セグメントは `SegmentedControl` を使います。
- 設定画面（`components/settingsUi.ts`）は、グループリストの下の補足（`captionClass`）・注意書き（`noticeClass`、`text-warn`）・行以外の領域の余白（`panelClass`）・ボタン（`primaryButtonClass` / `secondaryButtonClass`）・入力（`inputClass`）のクラスを共有します。

### recharts の色

recharts の SVG 属性（`stroke`・`fill` など）には Tailwind のクラスが効かないため、`app/stats/_components/chartTheme.ts` に **トークンと同じ 16 進値を複製** しています（`CHART_COLORS`: 罫線 = `line`、目盛り = `sub`、カーソル = `border`、折れ線 = `accent`、棒 = `money-dim` / `money`、平均の破線 = `cost-up`、最終点の縁 = `surface`。`CHART_TICK`: 目盛りの文字、`CHART_TOOLTIP_CLASS`: ツールチップの外枠）。
**トークン（`globals.css`）の色を変えたら `chartTheme.ts` も合わせてください**（自動では連動しません）。グラフの部品はこのファイルの定数だけを使い、16 進を直接書かないこと。

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
- **PC（≥ lg）**: 左に幅 240px のサイドバー（ロゴ・4 項目・「スキャンして記録」・ログイン / ユーザーボタン）。本文は最大 1040px（`width="narrow"` は 768px）・余白 32px で中央に置きます。
- スキャンボタンは `ScanActionMenu`（撮影する / アルバムから選ぶ / 手動で入力）を開きます。スマホはボトムシート、PC はボタン直下のポップオーバー。
  /app ではホームが登録した処理（`components/ScanActions.tsx`）を項目のタップの中で直接呼び（ファイル選択がブロックされないように）、解析中・閲覧専用などで押せない項目は無効にして理由を 1 行添えます。
  他の画面では `/app?action=scan|album|manual` に遷移し、/app の `useShortcutActions` が処理します（撮影・アルバムはホームの上に「撮影の準備ができました」のカードも出す）。未ログインでは AI スキャンを無効にし、手動入力だけ選べます。
- `PageHeader` は左に見出し、右に車両チップ（`VehicleSelector`）。/app のスマホ表示は見出しの代わりにロゴ（`brand`）。スマホではログイン / ユーザーボタンもヘッダー右端に置きます。

## 画面ごとの構成

各画面の部品とデータの流れは [architecture.md](./architecture.md#メイン画面の構成app)。ここでは見た目の組み立てだけ示します。いずれもヘッダー（`PageHeader`）の右に車両チップ（`VehicleSelector`）を置きます。

### ホーム（/app）

- **スマホ**: 1 カラム。ヘッダーはロゴ → ヒーロー（燃費の半円メーター。前回比・平均のチップ。`rounded-hero`）→「今月」（給油代・給油量・単価の `ValueRow`）→「最近の記録」（3 件、「すべて見る」）。記録の入口（撮影 / アルバム / 手動）はタブバー中央のスキャンボタンから開くメニューで、一覧としては記録が 0 件のときだけ「記録する」を出す。
- **PC**: 2 カラム。左にヒーローと今月、右に最近の記録・「記録する」（3 項目）・画像のドロップ先の細い行（`DropZoneRow`）。見出しは「ホーム」。
- 解析中・プレビューの状態カード、他の画面・ショートカットから撮影で来たときの「撮影の準備ができました」（`ScanReadyPrompt`。アクセント色の薄い枠）はヘッダーの下、2 カラムの上に全幅で出す。手動入力・編集はヒーローの位置に入力フォームのカード（アクセント色の薄い枠）として差し替わる。

### 履歴（/history）

- **スマホ**: 操作列（年・月・並び順のチップ。折り返しあり。右端に CSV の `IconButton`）→ 月ごとの見出し（左に「2026年9月」、右に「n回・¥合計」）と行の一覧。行は左に日と曜日、中に店舗名と補足（燃料種別・給油量・区間）、右に燃費と支払総額。押すと行の下に明細と操作（編集 / 別の車両へ移動 / 削除）が開く。
- **PC**: 同じ一覧に列見出しを足し、給油量・区間（トリップは「走行距離」）・単価を右側の列に並べる（補足からは外す）。
- 一覧は `overflow-hidden` を避けるため `GroupedList` ではなく同じ見た目の `<ul>`（上の注意）。

### 統計（/stats）

- **スマホ**: 1 カラム。期間の `SegmentedControl` → 平均燃費のヒーロー（大きな数値 + 最高・最低 + 推移グラフ）→「費用」（`ValueRow` 4 行）→「月ごとの給油代」→「単価の推移」。
- **PC**: 2 カラムのグリッド。上段に左: ヒーロー / 右: 費用、下段に月ごとの給油代と単価の推移。期間の切り替えは最大幅 `max-w-md`。

### 設定（/settings）

- 幅の狭い 1 カラム（`AppFrame width="narrow"`、最大 768px）。スマホ・PC とも同じ並びで、「データ」「バックアップ」「復元」「インポート」の `Section` それぞれにグループリスト（`ListRow` でファイルを選ぶ・書き出す）を置く。復元・取り込みのプレビューや確認は行の下の領域（`panelClass`）に開く。

## ルール

- 色・角丸はトークンを使う。グラデーションはスキャンボタンだけ。
- 数値は `num`。単位（km/L・円・L）は小さく `text-sub` で添える。
- タッチ領域は 40px 以上（44px 推奨）。アイコンだけのボタンには日本語の `aria-label` を付ける。
- 行の区切りは `divide-line`、操作部品の枠は `border-border`。
- スマホは 1 カラム・左右 16px。PC は同じ部品を 2 カラムなどに並べ直す（別デザインにはしない）。
- 横スクロールを出さない（長い名前は `truncate`）。
