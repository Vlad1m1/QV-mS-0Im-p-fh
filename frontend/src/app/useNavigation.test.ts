// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseHash, useNavigation } from "./useNavigation";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

describe("experiment deep links", () => {
  it("opens only a positive safe experiment id", () => {
    expect(parseHash("#experiment=42")).toBe(42);
    for (const hash of [
      "",
      "#",
      "#experiment=0",
      "#experiment=-1",
      "#experiment=9007199254740992",
      "#experiment=2/trailing",
      "#other=1",
    ]) {
      expect(parseHash(hash)).toBeNull();
    }
  });
});

describe("scroll position between journal views", () => {
  it("opens a different experiment at the top without resetting on an unrelated render", () => {
    const scroll = vi.spyOn(window, "scrollTo");
    const { result, rerender } = renderHook(useNavigation);
    scroll.mockClear();
    act(() => result.current.navigate(42));
    expect(result.current.selectedId).toBe(42);
    expect(window.location.hash).toBe("#experiment=42");
    expect(scroll).toHaveBeenCalledExactlyOnceWith({
      top: 0,
      left: 0,
      behavior: "instant",
    });
    scroll.mockClear();
    rerender();
    expect(scroll).not.toHaveBeenCalled();
  });

  it("resets on hash navigation in either direction", () => {
    const scroll = vi.spyOn(window, "scrollTo");
    const { result } = renderHook(useNavigation);
    scroll.mockClear();
    act(() => {
      window.history.pushState(null, "", "#experiment=7");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(result.current.selectedId).toBe(7);
    act(() => {
      window.history.pushState(null, "", "#");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(result.current.selectedId).toBeNull();
    expect(scroll).toHaveBeenCalledTimes(2);
    expect(scroll).toHaveBeenLastCalledWith({
      top: 0,
      left: 0,
      behavior: "instant",
    });
  });

  it("prevents native restoration from overriding route scroll and restores it on unmount", () => {
    window.history.scrollRestoration = "auto";
    const { unmount } = renderHook(useNavigation);
    expect(window.history.scrollRestoration).toBe("manual");
    unmount();
    expect(window.history.scrollRestoration).toBe("auto");
  });
});
