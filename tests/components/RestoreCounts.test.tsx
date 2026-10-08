import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import RestoreCounts from "@/components/RestoreCounts";

const counts = { vehiclesNew: 1, vehiclesMatched: 2, recordsNew: 30, recordsSkipped: 4 };

describe("RestoreCounts", () => {
  it("shows the four counts with their labels", () => {
    render(<RestoreCounts counts={counts} />);
    for (const [label, value] of [
      ["新規車両", "1"],
      ["既存に一致", "2"],
      ["追加される記録", "30"],
      ["重複でスキップ", "4"],
    ] as const) {
      expect(screen.getByText(label).nextElementSibling).toHaveTextContent(value);
    }
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("shows notes even without counts", () => {
    render(<RestoreCounts counts={null} notes={["補足 1", "補足 2"]} />);
    expect(screen.queryByText("新規車両")).not.toBeInTheDocument();
    expect(screen.getAllByRole("listitem").map(li => li.textContent)).toEqual(["補足 1", "補足 2"]);
  });
});
