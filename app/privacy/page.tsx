import type { Metadata } from "next";
import { ENACTED_ON, ISSUES_URL, LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "プライバシーポリシー | FuelLens",
  description: "FuelLens が取得する情報、利用目的、外部サービス、保存期間と削除についての説明です。",
};

const ext = (href: string, label: string) => (
  <a href={href} target="_blank" rel="noopener noreferrer">{label}</a>
);

export default function PrivacyPage() {
  return (
    <LegalPage title="プライバシーポリシー" enactedOn={ENACTED_ON}>
      <section>
        <h2>1. 事業者</h2>
        <p>
          FuelLens（以下「本サービス」）は「FuelLens 運営者」が運営する、給油記録と燃費を管理する Web アプリです。
          本ポリシーは、本サービスにおける利用者の情報の取り扱いを定めます。
        </p>
      </section>

      <section>
        <h2>2. 取得する情報</h2>
        <ul>
          <li>
            アカウント情報: ログインした場合、認証サービス Clerk を通じてメールアドレスと氏名（表示名）を取得します。
            Google アカウントでログインしたときは、そのプロフィール情報（名前・メールアドレス・プロフィール画像）を取得します。
            パスワードは本サービスでは保持しません。
          </li>
          <li>
            給油記録・車両情報: 日付、店舗名、燃料種別、給油量、金額、区間距離やオドメーター、メモ、車両名や車種など、利用者が入力または確認して保存した内容。
          </li>
          <li>
            アップロードした画像: AI 読み取りのために送信したレシート・メーターの写真。読み取りのためにだけ処理し、本サービスのデータベースやストレージには保存しません。
          </li>
          <li>
            アクセス情報: 閲覧したページのパスなどの統計情報（Vercel Web Analytics）。ページの URL からクエリ文字列とハッシュは取り除いて送信します。
          </li>
          <li>
            通信情報: AI 読み取りの利用回数を制限するため、リクエスト元の IP アドレスをサーバーのメモリ上で一時的に使います（データベースには保存しません）。
            また、サーバーの動作記録（ログ）に処理の結果やエラーが残ることがあります。画像そのものは記録しません。
          </li>
        </ul>
      </section>

      <section>
        <h2>3. 利用目的</h2>
        <ul>
          <li>給油記録の保存・表示、燃費や費用の計算、統計の表示</li>
          <li>ログインと本人確認、記録を複数の端末で利用できるようにすること</li>
          <li>レシート・メーター画像の AI 読み取り</li>
          <li>不正利用や過剰な利用の防止、障害の調査、サービスの改善</li>
          <li>お問い合わせへの対応</li>
        </ul>
      </section>

      <section>
        <h2>4. 外部サービスの利用</h2>
        <p>本サービスは次の外部サービスを利用します。各社への情報の送信は、それぞれの目的の範囲に限ります。</p>
        <ul>
          <li>
            Clerk（認証）: アカウント情報の管理とログイン。{ext("https://clerk.com/legal/privacy", "Clerk のプライバシーポリシー")}
          </li>
          <li>
            Supabase（データベース）: ログイン中の給油記録・車両情報の保存。{ext("https://supabase.com/privacy", "Supabase のプライバシーポリシー")}
          </li>
          <li>
            Google Gemini API（AI 読み取り）: 読み取りを実行したときに、画像を Google に送信します。
            {ext("https://policies.google.com/privacy", "Google のプライバシーポリシー")}、
            {ext("https://ai.google.dev/gemini-api/terms", "Gemini API の利用規約")}もご確認ください。
          </li>
          <li>
            Vercel（ホスティング・アクセス解析）: 本サービスの配信と、Cookie を使わないページ閲覧の統計。
            {ext("https://vercel.com/legal/privacy-policy", "Vercel のプライバシーポリシー")}
          </li>
        </ul>
        <p>Google アカウントでログインする場合、Google のログイン機能（OAuth）を Clerk 経由で利用します。</p>
      </section>

      <section>
        <h2>5. 第三者提供</h2>
        <p>
          法令に基づく場合を除き、利用者の同意なく個人情報を第三者に提供しません。
          上記の外部サービスへの送信はサービス提供のための利用であり、情報の販売や広告目的の提供は行いません。
        </p>
      </section>

      <section>
        <h2>6. 保存期間と削除</h2>
        <ul>
          <li>ログインしていない間のデータは、お使いのブラウザ（localStorage）にだけ保存され、サーバーには送られません。ブラウザのデータを消去すると削除されます。</li>
          <li>ログイン中の記録・車両は、利用者が削除するまで保存します。記録の削除と車両の削除（その車両の記録も同時に削除）は、アプリ内からいつでもできます。</li>
          <li>設定画面から、全データを JSON / CSV で書き出せます。</li>
          <li>
            アカウントとデータの完全な削除は、現時点ではアプリ内にありません。{ext(ISSUES_URL, "GitHub Issues")}に削除の希望をお知らせください。確認のうえ対応します。
          </li>
          <li>他のアプリから共有された画像は、ブラウザの IndexedDB に一時的に置かれ、取り込み後に消えます。</li>
        </ul>
      </section>

      <section>
        <h2>7. 安全管理</h2>
        <p>
          通信は HTTPS で保護します。データベースは行単位のアクセス制御（RLS）により、利用者は自分のデータだけを読み書きできます。
          ただし、完全な安全性を保証するものではありません。
        </p>
      </section>

      <section>
        <h2>8. Cookie 等</h2>
        <p>
          ログインの維持のために Clerk が Cookie を使用します。アクセス解析（Vercel Web Analytics）は Cookie を使わず、利用者を個別に追跡しません。
          このほか、ブラウザの localStorage を使用します（ログインしていないときの記録、選択中の車両など）。
        </p>
      </section>

      <section>
        <h2>9. 改定</h2>
        <p>必要に応じて本ポリシーを改定します。重要な変更は本ページで告知し、改定後の利用をもって同意したものとみなします。</p>
      </section>

      <section>
        <h2>10. お問い合わせ</h2>
        <p>
          {ext(ISSUES_URL, "GitHub Issues")}からご連絡ください。Issues は公開されるため、メールアドレスなどの個人情報は書き込まないでください。
          データの削除を希望する場合は、その旨を Issue に書いてください。こちらから連絡方法をご案内します。
        </p>
      </section>
    </LegalPage>
  );
}
