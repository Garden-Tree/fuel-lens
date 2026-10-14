import { TrendingUp } from "lucide-react";

/** グラフカード内の「データ不足」表示 */
export default function ChartEmpty({ message }: { message: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-4 text-center text-sm text-sub">
      <TrendingUp className="mb-3 h-8 w-8 text-faint" aria-hidden="true" />
      <p>{message}</p>
    </div>
  );
}
