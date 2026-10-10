import { useId, type ReactNode } from "react";

/**
 * 見出し付きのまとまり（グループリストの上の小見出し）。
 * 見出しは 13px・`text-sub`・左右 16px の余白。右側に「すべて見る」リンクなどを置ける。
 *
 * 使い方:
 *   <Section title="最近の記録" action={<Link href="/history" className="text-accent">すべて見る</Link>}>
 *     <GroupedList>...</GroupedList>
 *   </Section>
 */
export type SectionProps = {
  /** 見出し（h2 として描画する。見出しにしたくないときは `headingLevel={null}`） */
  title: ReactNode;
  /** 見出しの右側に置く要素（リンク・件数など） */
  action?: ReactNode;
  /** 見出し要素のレベル。既定 2。null で見出し要素にしない（div） */
  headingLevel?: 2 | 3 | null;
  className?: string;
  children: ReactNode;
};

export function Section({ title, action, headingLevel = 2, className = "", children }: SectionProps) {
  const id = useId();
  const Heading = headingLevel === null ? "div" : (`h${headingLevel}` as const);
  return (
    <section aria-labelledby={headingLevel === null ? undefined : id} className={`flex flex-col gap-1.5 ${className}`}>
      <div className="flex min-h-6 items-center justify-between gap-3 px-4">
        <Heading id={headingLevel === null ? undefined : id} className="text-[13px] font-medium text-sub">
          {title}
        </Heading>
        {action && <div className="shrink-0 text-[13px]">{action}</div>}
      </div>
      {children}
    </section>
  );
}

/**
 * 角丸 16px の面（`bg-surface`）。直下の子（行）の間に区切り線（`border-line`）を引く。
 * 中身は ListRow / ValueRow を並べる想定。`as="ul"` のときは子を `<li>` で包むこと。
 */
export type GroupedListProps = {
  as?: "div" | "ul" | "ol";
  className?: string;
  children: ReactNode;
};

export function GroupedList({ as: Tag = "div", className = "", children }: GroupedListProps) {
  return (
    <Tag className={`overflow-hidden rounded-2xl bg-surface divide-y divide-line ${className}`}>{children}</Tag>
  );
}
