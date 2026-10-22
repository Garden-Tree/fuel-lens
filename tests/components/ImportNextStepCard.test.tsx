import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ImportNextStepCard from "@/components/ImportNextStepCard";

describe("ImportNextStepCard", () => {
  it("トリップ入力方式: トリップメーターを撮る案内と 2 つのリンクを出す", () => {
    render(<ImportNextStepCard recordsAdded={26} vehiclesAdded={1} odometerMode={false} onDismiss={() => {}} />);
    expect(screen.getByRole("heading", { name: "取り込みが終わりました" })).toBeInTheDocument();
    expect(screen.getByText(/記録 26 件・車両 1 台を追加しました/)).toBeInTheDocument();
    expect(screen.getByText(/レシートとトリップメーターを 1 枚に撮るだけ/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "記録の画面へ" })).toHaveAttribute("href", "/app");
    expect(screen.getByRole("link", { name: "履歴を見る" })).toHaveAttribute("href", "/history");
  });

  it("オドメーター入力方式: オドメーターを撮る案内にする（車両が増えないときは車両数を出さない）", () => {
    render(<ImportNextStepCard recordsAdded={3} vehiclesAdded={0} odometerMode onDismiss={() => {}} />);
    expect(screen.getByText(/メーターパネル（オドメーター）を 1 枚に撮るだけ/)).toBeInTheDocument();
    expect(screen.queryByText(/車両 0 台/)).not.toBeInTheDocument();
  });

  it("閉じるボタンで onDismiss を呼ぶ", async () => {
    const onDismiss = vi.fn();
    render(<ImportNextStepCard recordsAdded={1} vehiclesAdded={0} odometerMode={false} onDismiss={onDismiss} />);
    await userEvent.click(screen.getByRole("button", { name: "閉じる" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
