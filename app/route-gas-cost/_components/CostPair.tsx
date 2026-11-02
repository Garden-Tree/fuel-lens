// 表のセル: 上段に片道、下段に往復の金額

export default function CostPair({ oneWay, roundTrip }: { oneWay: string; roundTrip: string }) {
  return (
    <>
      <span className="num block text-ink">{oneWay}</span>
      <span className="num block text-xs font-normal text-sub">{roundTrip}</span>
    </>
  );
}
