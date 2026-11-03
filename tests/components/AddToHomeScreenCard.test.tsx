import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AddToHomeScreenCard from "@/app/(app)/app/_components/AddToHomeScreenCard";
import { A2HS_HEADING, A2HS_HEADING_NO_RECORDS, A2HS_STEPS } from "@/lib/addToHomeScreen";

describe("AddToHomeScreenCard", () => {
  it("prompt: 「ホーム画面に追加」で onInstall、「あとで」で onDismiss を呼ぶ", async () => {
    const onInstall = vi.fn();
    const onDismiss = vi.fn();
    render(<AddToHomeScreenCard hasRecords guide={{ mode: "prompt" }} onInstall={onInstall} onDismiss={onDismiss} />);
    expect(screen.getByRole("heading", { name: A2HS_HEADING })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "ホーム画面に追加" }));
    expect(onInstall).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "あとで" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("steps: 手順の文だけを出し（追加ボタンなし）、「閉じる」で onDismiss を呼ぶ", async () => {
    const onDismiss = vi.fn();
    render(<AddToHomeScreenCard hasRecords guide={{ mode: "steps", steps: A2HS_STEPS.ios }} onInstall={() => {}} onDismiss={onDismiss} />);
    expect(screen.getByText(A2HS_STEPS.ios)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ホーム画面に追加" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "閉じる" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("記録が無いときは次の給油向けの見出しにする", () => {
    render(<AddToHomeScreenCard hasRecords={false} guide={{ mode: "steps", steps: A2HS_STEPS.ios }} onInstall={() => {}} onDismiss={() => {}} />);
    expect(screen.getByRole("heading", { name: A2HS_HEADING_NO_RECORDS })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: A2HS_HEADING })).not.toBeInTheDocument();
  });
});
