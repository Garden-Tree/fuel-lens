import Link from "next/link";
import { ChevronRight, History } from "lucide-react";

/** 履歴画面へのリンクボタン（「対象: ○○」付き） */
export default function HistoryLinkCard({ vehicleName }: { vehicleName: string }) {
  return (
    <div className="mt-auto w-full">
      <Link
        href="/history"
        className="group flex items-center justify-between w-full p-4 md:p-6 rounded-2xl bg-gray-900 border border-gray-800 hover:border-gray-700 transition"
      >
        <div className="flex items-center gap-4">
          <div className="p-3 bg-gray-800 rounded-xl">
            <History className="w-6 h-6 text-gray-400" />
          </div>
          <div>
            <p className="text-base md:text-lg font-bold text-gray-200">過去の記録を見る</p>
            <p className="text-sm text-gray-500">対象: {vehicleName}</p>
          </div>
        </div>
        <ChevronRight className="w-6 h-6 text-gray-500 group-hover:text-white transition" />
      </Link>
    </div>
  );
}
