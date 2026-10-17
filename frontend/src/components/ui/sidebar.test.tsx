// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { Button } from "./button";
import {
  Sidebar,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "./sidebar";

const originalWidth = window.innerWidth;
beforeEach(() => {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 390,
  });
});
afterEach(() => {
  cleanup();
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: originalWidth,
  });
});

function MobileNavigation() {
  const { setOpenMobile } = useSidebar();
  return (
    <Sidebar>
      <Button onClick={() => setOpenMobile(false)}>Эксперименты</Button>
    </Sidebar>
  );
}

async function openNavigation() {
  render(
    <SidebarProvider>
      <SidebarTrigger />
      <MobileNavigation />
    </SidebarProvider>,
  );
  const trigger = screen.getByRole("button", {
    name: "Открыть меню журнала",
  });
  trigger.focus();
  fireEvent.click(trigger);
  const dialog = await screen.findByRole("dialog", {
    name: "Навигация журнала",
  });
  expect(trigger.closest('[aria-hidden="true"]')).not.toBeNull();
  return { trigger, dialog };
}

async function expectNavigationClosed(trigger: HTMLElement) {
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await waitFor(() => expect(document.activeElement).toBe(trigger));
}

it("returns keyboard focus to the sidebar trigger after Escape on mobile", async () => {
  const { trigger, dialog } = await openNavigation();
  fireEvent.keyDown(dialog, { key: "Escape" });
  await expectNavigationClosed(trigger);
});

it("returns focus after mobile navigation closes its sheet", async () => {
  const { trigger, dialog } = await openNavigation();
  fireEvent.click(within(dialog).getByRole("button", { name: "Эксперименты" }));
  await expectNavigationClosed(trigger);
});

it("returns focus after using the sheet close control", async () => {
  const { trigger, dialog } = await openNavigation();
  fireEvent.click(within(dialog).getByRole("button", { name: "Закрыть" }));
  await expectNavigationClosed(trigger);
});
