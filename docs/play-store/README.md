# Google Play で公開する手順（TWA）

FuelLens の PWA を、Trusted Web Activity（TWA。Chrome の機能でアプリ画面を枠なしで開くアプリ）として Google Play に公開するためのガイドです。
アプリの実体は今までどおり https://fuel-lens.gadelog.com の Web で、Play 版はそれを包む薄い Android アプリです。**Web を更新すれば、Play 版にも（再提出なしで）反映されます。**
Play Console と PWABuilder の操作はオーナーが行います。リポジトリ側の準備（manifest、Digital Asset Links、掲載画像、掲載テキスト）は済んでいます。

| やること | 誰が |
|---|---|
| manifest の整備、`/.well-known/assetlinks.json`、スクリーンショットなどの画像、掲載テキスト | 準備済み（このディレクトリ） |
| Play Console の登録、PWABuilder でのパッケージ作成、掲載情報の入力、署名鍵の保管 | オーナー |
| Vercel の環境変数 `ANDROID_ASSETLINKS_SHA256` の設定と再デプロイ | オーナー |

## 0. 全体の流れ

1. Play Console のデベロッパー アカウントを登録する（1 回だけ 25 USD）
2. PWABuilder で Android パッケージ（`.aab`）を作る（署名鍵も一緒にできる）
3. 署名鍵のフィンガープリントを Vercel の `ANDROID_ASSETLINKS_SHA256` に設定して再デプロイし、assetlinks.json を確認する
4. Play Console でアプリを作り、`.aab` を内部テストにアップロードする
5. Play App Signing の鍵のフィンガープリントを assetlinks に**追加**する（ここが抜けやすい）
6. 掲載情報・データ セーフティ・コンテンツのレーティングを入力する
7. 内部テスト → クローズド テスト → 製品版の順に進める

## 1. 公開前の確認（コード側。準備済み）

| 項目 | 状態 |
|---|---|
| manifest（`app/manifest.ts`） | `id` / `name` / `short_name` / `start_url=/app` / `display=standalone` / `orientation=portrait` / 背景色・テーマ色 `#0B0F14` / `lang=ja` / `dir=ltr` / `categories` / アイコン 192・512（purpose any）と 512（purpose maskable）/ `screenshots`（narrow、1080x1920 を 3 枚）/ `shortcuts` / `share_target` |
| アイコン | `public/icons/`（通常と maskable）。maskable は片側 10% の余白付きで、主な図形は中央 80% の円（安全領域）に収まっています。`node scripts/generate-icons.mjs` で再生成できます |
| スクリーンショット | `public/screenshots/` と [screenshots/](./screenshots/) は同じ画像。元の画像（780x1688）は縦横比が約 2.16:1 で、Play の「長辺が短辺の 2 倍以内」に収まらないため、左右に地の色の余白を足して 9:16（1080x1920）にしてあります。`node scripts/generate-play-assets.mjs` で再生成できます |
| Digital Asset Links | `app/.well-known/assetlinks.json/route.ts`。環境変数が未設定のあいだは 404 を返します（[6 章](#6-digital-asset-links-の仕組みと確認)） |
| Service Worker | Web Share Target の受け取り専用（キャッシュなし）。TWA の動作には影響しません |

**ログインの確認（重要）**: ログインは Clerk のモーダルで、Google ログインは Google の画面へ遷移して戻ってきます。TWA は Chrome の上で動くので Google のログインは使えますが、
**内部テストで実機にインストールしたあとに、Google ログインとメールコードのログインの両方を必ず試してください**（ログイン後に Play 版のアプリに戻ってくること、AI 読み取りが動くこと）。
画面の上に URL バーが出る場合は、assetlinks の確認に失敗しています（[9 章](#9-うまくいかないとき)）。

## 2. Play Console に登録する

1. https://play.google.com/console にアクセスし、Google アカウントでデベロッパー アカウントを作る。**登録料は 1 回だけ 25 USD**（クレジットカード / デビットカード）。
2. アカウントの種類は「個人」か「組織」。個人は本人確認（身分証）が必要で、デベロッパー名と連絡先が**公開**されます。公開されたくない情報は専用のメールアドレスを用意してください。
3. 2023 年 11 月 13 日以降に作った**個人アカウント**は、製品版を公開する前に、**クローズド テストで一定数（12 人以上）のテスターが 14 日間連続でオプトインしている**必要があります。条件は変わることがあるので、Console の「製品版を公開」のチェックリストで最新を確認してください。
   テスターは Google アカウントのメールアドレスをグループ（Google グループなど）にまとめて登録します。
4. 連絡先メールアドレス（公開）は [listing.md](./listing.md#1-基本情報) の `<連絡用メールアドレス>` を決めて使います。

## 3. PWABuilder で Android パッケージを作る

https://www.pwabuilder.com を開き、次のように進めます。

1. URL の欄に `https://fuel-lens.gadelog.com` を入れて **Start**。
2. 診断のスコアで manifest と Service Worker が「OK」であることを確認（Service Worker は「共有の受け取り専用」で、オフライン対応は無いという警告が出ても公開には影響しません）。
3. **Package For Stores** → **Android** → **Generate Package**（または Options を開く）。
4. 次のように入力します。

| 項目 | 値 |
|---|---|
| Package ID | `com.gadelog.fuellens`（**変更しない**。assetlinks のパッケージ名と一致している必要があります） |
| App name | `FuelLens` |
| Launcher name | `FuelLens` |
| App version / Version code | `1.0.0` / `1`（更新のたびに Version code を増やす。[10 章](#10-アプリを更新するとき)） |
| Host | `fuel-lens.gadelog.com` |
| Start URL | `/app`（manifest から入る） |
| Display mode | Standalone |
| Status bar color / Navigation bar color | `#0B0F14` |
| Splash screen fade out | 既定のまま（Splash の背景色は `#0B0F14`） |
| Icon URL / Maskable icon URL | 自動で入る（`/icons/icon-512.png` / `/icons/icon-maskable-512.png`）。入っていなければそのとおり入力 |
| Fallback behavior | Custom Tabs（既定） |
| Notifications / Location delegation / Google Play Billing | **すべてオフ**（使っていない機能を有効にすると権限やデータ セーフティの申告が増えます） |
| Signing key | **New**（PWABuilder に新しく作らせる）。パスワードと別名は既定のままでよい |

5. **Generate** してダウンロードします。zip に次のものが入っています。
   - `*.aab`（Play にアップロードする本体）と、動作確認用の `*.apk`
   - **`signing.keystore`（署名鍵）と `signing-key-info.txt`（鍵のパスワード・別名・SHA-256 フィンガープリント）**
   - `assetlinks.json`（PWABuilder が作った見本。リポジトリでは環境変数から同じ内容を返すので、**貼り付ける必要はありません**。この中の `sha256_cert_fingerprints` の値だけ使います）

### 署名鍵は必ず保管する

**`signing.keystore` とそのパスワード（`signing-key-info.txt`）をパスワード マネージャーに保管してください。失くすとアプリを更新できなくなります**（Play App Signing を使っていればアップロード鍵のリセットを Google に依頼できますが、手間がかかります）。
リポジトリには**絶対にコミットしない**（`*.keystore` / `*.jks` / `*.aab` / `*.apk` / `signing-key-info.txt` は `.gitignore` に入れてありますが、そもそもリポジトリの中に置かないでください）。zip ごとリポジトリの外で管理します。

## 4. Vercel の環境変数に署名鍵のフィンガープリントを設定する

1. `signing-key-info.txt` の **SHA-256** の値（`14:6D:E9:…:E5` のようなコロン区切りの 64 桁。SHA-1 ではない）をコピーする。
2. Vercel のプロジェクト → Settings → Environment Variables で、Production に次を追加する。

   | Name | Value |
   |---|---|
   | `ANDROID_ASSETLINKS_SHA256` | 上の SHA-256（複数あるときはカンマ区切り。[5 章](#5-play-app-signing-の鍵アップロード鍵とアプリ署名鍵)） |

3. 再デプロイする（Deployments → 最新の本番デプロイの「Redeploy」）。値は秘密ではありませんが、リポジトリには置かない方針です。
4. 確認する（[6 章](#6-digital-asset-links-の仕組みと確認)）。

## 5. Play App Signing の鍵（アップロード鍵とアプリ署名鍵）

Play Console は既定で **Play App Signing** を使います。鍵が 2 つあります。

| 鍵 | 何か | assetlinks に必要か |
|---|---|---|
| アップロード鍵 | PWABuilder が作った `signing.keystore`。`.aab` に署名して Google に渡すための鍵 | PWABuilder が作った `.apk` を直接インストールして試すときだけ必要 |
| アプリ署名鍵 | Google が管理する鍵。**Play ストアから配られるアプリはこの鍵で署名し直される** | **必要（利用者のアプリは、この鍵の証明書で署名されている）** |

そのため、**Play App Signing を有効にしたあとは、Play Console に表示されるアプリ署名鍵の SHA-256 を assetlinks に追加しないと、Play から入れたアプリに URL バーが出てしまいます**（TWA の検証に失敗して Custom Tabs にフォールバックする）。

手順:

1. `.aab` を最初にアップロードして（内部テストでよい）、アプリの登録が済んだあと、Play Console → 対象アプリ → **テストとリリース → アプリの完全性（App integrity）→ Play アプリ署名** を開く（古い UI では「設定 → アプリの署名」）。
2. **アプリ署名鍵の証明書**の **SHA-256 証明書フィンガープリント**をコピーする。
3. Vercel の `ANDROID_ASSETLINKS_SHA256` を、**アップロード鍵（4 章）とアプリ署名鍵の両方をカンマ区切りで**入れ直す。

   ```
   14:6D:...:E5,AA:BB:...:99
   ```

4. 再デプロイして [6 章](#6-digital-asset-links-の仕組みと確認) の確認をやり直す。

> アップロード鍵を後から変えた（リセットした）ときも、同じようにフィンガープリントを追加してください。古い値を消すのは、その鍵でインストールした端末がもう無いと確信できてからにします。

## 6. Digital Asset Links の仕組みと確認

TWA は、起動時に `https://fuel-lens.gadelog.com/.well-known/assetlinks.json` を読み、「このパッケージ名と署名鍵のアプリは、このドメインの持ち主が認めている」ことを確認できたときだけ、URL バーなしの全画面で開きます。

- 実装: `app/.well-known/assetlinks.json/route.ts`（本体は `lib/assetlinks.ts`）。パッケージ名は `com.gadelog.fuellens` 固定、フィンガープリントは環境変数 `ANDROID_ASSETLINKS_SHA256`（カンマ区切りで複数可。コロン無しの 64 桁や小文字も整えて受け付け、SHA-256 の形になっていない値は捨てる）。
- **環境変数が未設定（または有効な値が 1 つも無い）ときは 404** を返します（空のリストは返さない）。
- 認証やリダイレクトを挟まないよう、`proxy.ts`（Clerk）の matcher から `/.well-known` を除外しています。サイトマップには載せていません。
- 値を変えたら**再デプロイ**が必要です（Vercel の CDN に最長 5 分キャッシュされることがあります）。

確認:

```bash
# 200 と JSON が返ること（リダイレクト 301/302/307 になっていないこと）
curl -i https://fuel-lens.gadelog.com/.well-known/assetlinks.json

# Google の検証 API（statements に com.gadelog.fuellens と鍵が出れば OK）
curl "https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://fuel-lens.gadelog.com&relation=delegate_permission/common.handle_all_urls"
```

期待する本文（フィンガープリントは例）:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.gadelog.fuellens",
      "sha256_cert_fingerprints": ["14:6D:E9:…:E5"]
    }
  }
]
```

実機の確認（開発者向け。USB デバッグ）: `adb shell pm get-app-links com.gadelog.fuellens` で `fuel-lens.gadelog.com: verified` と出ること。
アプリを起動して、URL バーが**出ない**ことが最終確認です。

## 7. コンテンツのレーティング質問票の答え

Play Console →「アプリのコンテンツ」→「コンテンツのレーティング」。メールアドレスを入れ、カテゴリは **「ユーティリティ、生産性、コミュニケーション、その他」** を選びます。

| 質問 | 答え |
|---|---|
| 暴力、血、恐怖、性的な内容、不適切な言葉、薬物、ギャンブル | すべて いいえ |
| ユーザー同士が交流・コンテンツを共有できる（UGC） | いいえ（記録は本人だけが見られる。シェア画像は OS の共有先へ出すだけで、アプリ内の交流はない） |
| ユーザーの現在地を他のユーザーに共有する | いいえ |
| デジタル商品の購入 / 課金を提供する | いいえ |
| 武器・規制対象商品の販売・宣伝 | いいえ |

想定される結果は「全年齢（IARC 3+）」です。[listing.md](./listing.md#6-アプリのコンテンツ) に、ターゲット層（18 歳以上）、広告（あり: 提携先の紹介）、アプリのアクセス権、アカウント削除の回答もまとめてあります。

## 8. 15 秒プロモーション動画の絵コンテ

Play の掲載（YouTube の URL を貼る）と、X / Zenn の投稿で使う縦型（9:16）の短い動画の案です。**撮影はスマホで**、実際の FuelLens の画面と実物を撮ります。
架空ではなく、**デモ用のアカウントとデモデータ**で撮ってください（スクリーンショットと同じデモデータが使えます）。

| 秒 | 絵 | 字幕（画面の下） | 撮り方 |
|---|---|---|---|
| 0〜2 | 給油機の前で、レシートとトリップメーターを並べて持つ手元。メーターの区間距離が読めるように | 給油のたびに、燃費をメモしていませんか？ | 外光の下で。メーターに反射が入らない角度 |
| 2〜5 | FuelLens を起動し、ホーム中央のカメラボタンをタップ | 写真を1枚撮るだけ | 画面収録 + 親指の見える撮影の 2 カット。ボタンは大きく |
| 5〜8 | レシートとメーターを 1 枚に収めて撮影 | レシートとメーターを一緒に | 手ブレに注意。シャッターの瞬間を見せる |
| 8〜11 | 「読み取り中」のあと、確認シートに給油量・金額・距離が並ぶ | AIが数字を読み取り | 画面収録。読み取り中は早送りしてよい（実際は数秒） |
| 11〜14 | 「保存」→ ホームの燃費ゲージ（例: 16.12 km/L）が動く | 燃費を自動で記録 | 画面収録。ゲージが出た瞬間で止める |
| 14〜15 | ロゴ + 「FuelLens」 + URL | 無料（提携先の紹介を含みます）  fuel-lens.gadelog.com | [フィーチャー グラフィック](./feature-graphic.png) の画面を静止で使ってもよい |

- 音声は無し（字幕とBGMのみ。BGM は商用利用可のものか、無しにする）。**実在のナンバー・個人情報・スタンドのレシートの個人を特定できる部分が映らない**ように、ナンバーはぼかすかデモ用の車を使う。
- Play に貼る場合は YouTube にアップロードする（限定公開でも可。年齢制限・広告の収益化は付けない）。
- X / Zenn 用には同じ動画を縦のまま使えます。1 行目は「写真1枚で燃費を記録できるアプリを作りました」、URL は https://fuel-lens.gadelog.com 。

## 9. うまくいかないとき

| 症状 | 原因と対処 |
|---|---|
| アプリの上に URL バーが出る | assetlinks の検証に失敗しています。(1) `curl -i` で 200 と JSON が返るか（404 なら環境変数が未設定 / 再デプロイ漏れ）、(2) **Play から入れたなら、アプリ署名鍵の SHA-256 が入っているか**（[5 章](#5-play-app-signing-の鍵アップロード鍵とアプリ署名鍵)）、(3) パッケージ名が `com.gadelog.fuellens` か、(4) リダイレクト（`www` 有無、http→https）を挟んでいないか |
| `curl` が 404 | `ANDROID_ASSETLINKS_SHA256` が未設定、またはフィンガープリントの形式が違う（SHA-1 ではなく SHA-256。32 組の 16 進をコロンでつなぐ）。設定後に再デプロイ |
| Google ログインが失敗する | 内部テストの端末の Chrome が古い、または別ブラウザが既定になっている。Chrome を最新にして再試行 |
| アップロード時に「署名が違う」 | 更新の `.aab` は、**最初と同じ `signing.keystore`** で署名する。PWABuilder の「Signing key」で **Use mine** を選び、保管している keystore とパスワードを入れる |
| 審査で「データ セーフティの申告と挙動が違う」 | [listing.md の 7 章](./listing.md#7-データ-セーフティ下書き)を見直す（Sentry を有効にしたときの追記など） |

## 10. アプリを更新するとき

**Web の変更（機能・画面の更新）は、デプロイするだけで Play 版にも反映されます。`.aab` の再提出は要りません。**
再提出が必要なのは次のときだけです。

- アイコン、アプリ名、テーマ色など、パッケージに焼き込まれる manifest の項目を変えたとき
- Play の「ターゲット API レベル」の要件が上がり、警告が届いたとき（毎年上がります。PWABuilder を最新で作り直して提出します）
- パッケージ ID や署名鍵の運用を変えるとき

手順:

1. PWABuilder で同じ URL からもう一度パッケージを作る。**Package ID は `com.gadelog.fuellens` のまま、Version code を前回より大きくする**（`1` → `2`。表示用の App version は `1.0.1` など）。
2. 署名鍵は **Use mine** で、保管している `signing.keystore` とパスワードを指定する（新しく作らない）。
3. 作った `.aab` を Play Console の対象トラック（内部テスト → 製品版）にアップロードし、リリースノートを書いて審査に出す。

## 11. 公開までのチェックリスト

- [ ] Play Console のデベロッパー アカウントを登録した（25 USD、本人確認）
- [ ] PWABuilder で `.aab` を作り、`signing.keystore` とパスワードをパスワード マネージャーに保管した
- [ ] `ANDROID_ASSETLINKS_SHA256` を設定して再デプロイし、`/.well-known/assetlinks.json` が 200 で返る
- [ ] Play アプリ署名鍵の SHA-256 も追加した（アップロード鍵とカンマ区切り）
- [ ] 実機（内部テスト）で URL バーが出ず、Google ログインとメールコードのログイン、AI 読み取りが動く
- [ ] 掲載情報（[listing.md](./listing.md)）・グラフィック・データ セーフティ・レーティング・ターゲット層・アプリのアクセス権を入力した
- [ ] クローズド テストの条件（個人アカウントの場合）を満たした
- [ ] 製品版に公開
