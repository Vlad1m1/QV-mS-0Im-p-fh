import { describe, expect, it } from "vitest";
import { attempt } from "../../test/fixtures";
import { comparisonPair, comparisonRows } from "./comparison";

describe("comparison of independent measurements", () => {
  it("never compares an attempt to itself, including stale selected ids", () => {
    const attempts = [attempt(), attempt(12)];
    expect(comparisonPair(attempts, 11, 11)?.map((row) => row.id)).toEqual([
      11, 12,
    ]);
    expect(comparisonPair(attempts, 999, 999)?.map((row) => row.id)).toEqual([
      11, 12,
    ]);
    expect(comparisonPair([attempt()], 11, 11)).toBeNull();
  });
  it("matches names regardless of case and preserves differing or missing units", () => {
    const left = attempt();
    const right = attempt(12, {
      parameters: [
        { name: "температура", value: "20", unit: "K" },
        { name: "Масса", value: "100", unit: "g" },
      ],
    });
    expect(comparisonRows(left, right)).toEqual([
      {
        key: "температура",
        name: "Температура",
        left: "20 °C",
        right: "20 K",
        different: true,
      },
      {
        key: "масса",
        name: "Масса",
        left: "Не измерялось",
        right: "100 g",
        different: true,
      },
    ]);
  });
});
