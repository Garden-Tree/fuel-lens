import { TrendingUp } from "lucide-react";

/** グラフカード内の「データ不足」表示 */
export default function ChartEmpty({ message }: { message: string }) {
  return (
    <div className="h-full w-full flex flex-col items-center justify-center text-center text-gray-600 text-sm px-4">
      <TrendingUp className="w-8 h-8 text-gray-800 mb-3" />
      <p>{message}</p>
    </div>
  );
}
