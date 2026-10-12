import type { Metadata } from "next";
import Link from "next/link";
import { ENACTED_ON, ISSUES_URL, LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "利用規約 | FuelLens",
  description: "FuelLens の利用条件、禁止事項、免責事項についての規約です。",
};

export default function TermsPage() {
  return (
    <LegalPage title="利用規約" enactedOn={ENACTED_ON}>
      <section>
        <h2>1. 適用</h2>
        <p>
          本規約は、「FuelLens 運営者」（以下「運営者」）が提供する FuelLens（以下「本サービス」）の利用条件を定めます。
          利用者は、本サービスを利用することで本規約に同意したものとみなされます。個人情報の取り扱いは
          <Link href="/privacy">プライバシーポリシー</Link>に定めます。
        </p>
      </section>

      <section>
        <h2>2. サービス内容</h2>
        <p>
          本サービスは、給油の記録と満タン法による燃費の計算・表示を行います。レシートとトリップメーターの写真を AI（Google Gemini）で読み取る機能もあります。
        </p>
        <p>
          AI による読み取り結果と燃費の計算結果は目安であり、正確性・完全性を保証しません。保存前に内容を確認し、必要に応じて修正してください。
        </p>
      </section>

      <section>
        <h2>3. 禁止事項</h2>
        <ul>
          <li>法令または公序良俗に反する行為</li>
          <li>本サービスや外部サービスの運営を妨げる行為（過剰なリクエスト、不正アクセス、制限の回避など）</li>
          <li>他人になりすます行為、他人の権利を侵害する画像のアップロード</li>
          <li>給油の記録と無関係な画像や不適切な画像を AI 読み取りに送ること</li>
          <li>その他、運営者が不適切と判断する行為</li>
        </ul>
      </section>

      <section>
        <h2>4. 免責</h2>
        <ul>
          <li>本サービスは現状のまま提供し、特定の目的への適合性、継続性、無誤謬性を保証しません。</li>
          <li>データの消失・誤り、サービスの中断や外部サービスの障害から生じた損害について、運営者は故意または重過失がある場合を除き責任を負いません。</li>
          <li>大切な記録は、設定画面のバックアップで書き出して保管してください。</li>
        </ul>
      </section>

      <section>
        <h2>5. サービスの変更・停止</h2>
        <p>運営者は、事前の通知なく本サービスの内容を変更し、または提供を停止・終了することがあります。</p>
      </section>

      <section>
        <h2>6. 規約の変更</h2>
        <p>運営者は必要に応じて本規約を変更できます。変更後に本サービスを利用した場合、変更に同意したものとみなします。</p>
      </section>

      <section>
        <h2>7. 準拠法</h2>
        <p>本規約は日本法に準拠します。</p>
      </section>

      <section>
        <h2>8. お問い合わせ</h2>
        <p>
          <a href={ISSUES_URL} target="_blank" rel="noopener noreferrer">GitHub Issues</a>からご連絡ください。
          Issues は公開されるため、個人情報は書き込まないでください。
        </p>
      </section>
    </LegalPage>
  );
}
