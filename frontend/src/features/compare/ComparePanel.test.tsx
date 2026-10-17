// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { attempt } from "../../test/fixtures";
import { ComparePanel } from "./ComparePanel";

afterEach(cleanup);

it("requires two independent attempts before exposing comparison controls", () => {
  render(<ComparePanel attempts={[attempt()]} />);
  expect(screen.getByText("Нужны две попытки")).toBeDefined();
  expect(screen.queryByRole("combobox")).toBeNull();
});

it("changes the comparison pair without offering the same attempt on both sides", () => {
  render(
    <ComparePanel
      attempts={[
        attempt(),
        attempt(12, {
          parameters: [{ name: "Температура", value: "40", unit: "°C" }],
        }),
        attempt(13, {
          parameters: [{ name: "Температура", value: "60", unit: "°C" }],
        }),
      ]}
    />,
  );
  const left = screen.getByRole("combobox", {
    name: "Первая попытка для сравнения",
  });
  const right = screen.getByRole("combobox", {
    name: "Вторая попытка для сравнения",
  });
  expect(within(left).queryByRole("option", { name: /Попытка 2/ })).toBeNull();
  fireEvent.change(left, { target: { value: "13" } });
  expect(within(right).queryByRole("option", { name: /Попытка 3/ })).toBeNull();
  const temperature = screen.getByRole("row", { name: /Температура/ });
  expect(within(temperature).getByText("60 °C")).toBeDefined();
  expect(within(temperature).getByText("40 °C")).toBeDefined();
  expect(within(temperature).queryByText("20 °C")).toBeNull();
});
