// @vitest-environment jsdom
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetInstallStateForTests } from "../../src/lib/install";
import { renderApp } from "./renderApp";

const DISMISS_KEY = "recall-studio:install-dismissed";

/** A stand-in for the event Chrome fires when the site can be installed. */
function firePrompt(outcome: "accepted" | "dismissed" = "accepted") {
  const event = new Event("beforeinstallprompt", { cancelable: true }) as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
  event.prompt = vi.fn(async () => {});
  event.userChoice = Promise.resolve({ outcome });
  act(() => {
    window.dispatchEvent(event);
  });
  return event;
}

function setStandalone(on: boolean) {
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: on && q.includes("standalone"), media: q, addEventListener() {}, removeEventListener() {} }));
}

beforeEach(() => {
  window.localStorage.removeItem(DISMISS_KEY);
  resetInstallStateForTests();
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.removeItem(DISMISS_KEY);
  resetInstallStateForTests();
});

describe("install button", () => {
  it("is hidden on Home until the browser says the app can be installed", async () => {
    renderApp({ route: "/" });
    await screen.findByRole("heading", { level: 1, name: "Home" });
    expect(screen.queryByRole("button", { name: "Install app" })).not.toBeInTheDocument();
    firePrompt();
    expect(await screen.findByRole("button", { name: "Install app" })).toBeInTheDocument();
  });

  it("catches a prompt that fires before the screen was open", async () => {
    firePrompt(); // e.g. the browser fired it while the user was elsewhere
    renderApp({ route: "/settings" });
    expect(await screen.findByRole("button", { name: "Install app" })).toBeInTheDocument();
  });

  it("stops the browser's own mini-bar, then shows the install dialog when the button is pressed", async () => {
    renderApp({ route: "/settings" });
    const event = firePrompt("accepted");
    expect(event.defaultPrevented).toBe(true);
    await userEvent.click(await screen.findByRole("button", { name: "Install app" }));
    expect(event.prompt).toHaveBeenCalledTimes(1);
    // The prompt can only be used once, so the button goes away afterwards.
    await waitFor(() => expect(screen.queryByRole("button", { name: "Install app" })).not.toBeInTheDocument());
  });

  it("is friendly when the user declines, and falls back to manual instructions", async () => {
    renderApp({ route: "/settings" });
    firePrompt("dismissed");
    await userEvent.click(await screen.findByRole("button", { name: "Install app" }));
    // The one-use prompt is gone, so the screen explains the browser menu instead of a dead button.
    expect(await screen.findByText(/Add page to/)).toBeInTheDocument();
  });

  it("shows 'installed' and no button after the browser reports the install", async () => {
    renderApp({ route: "/settings" });
    firePrompt();
    await screen.findByRole("button", { name: "Install app" });
    act(() => {
      window.dispatchEvent(new Event("appinstalled"));
    });
    expect(await screen.findByText(/is installed on this device/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Install app" })).not.toBeInTheDocument();
  });

  it("shows no install prompts when the app is already running as an installed app", async () => {
    setStandalone(true);
    renderApp({ route: "/" });
    await screen.findByRole("heading", { level: 1, name: "Home" });
    firePrompt();
    expect(screen.queryByRole("button", { name: "Install app" })).not.toBeInTheDocument();
    expect(screen.queryByText("Install Recall Studio")).not.toBeInTheDocument();
  });

  it("Home banner can be dismissed and stays away on the next visit", async () => {
    const first = renderApp({ route: "/" });
    firePrompt();
    await userEvent.click(await screen.findByRole("button", { name: "Not now" }));
    expect(screen.queryByText("Install Recall Studio")).not.toBeInTheDocument();
    expect(window.localStorage.getItem(DISMISS_KEY)).toBe("1");
    first.unmount();

    renderApp({ route: "/" });
    await screen.findByRole("heading", { level: 1, name: "Home" });
    expect(screen.queryByText("Install Recall Studio")).not.toBeInTheDocument();
    // Settings still offers it, so dismissing the banner never removes the option.
    first.unmount();
    renderApp({ route: "/settings" });
    expect(await screen.findByRole("button", { name: "Install app" })).toBeInTheDocument();
  });

  it("explains Add to Home Screen on iPhone, where no prompt exists", async () => {
    vi.stubGlobal("navigator", { ...window.navigator, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", platform: "iPhone", maxTouchPoints: 5 });
    renderApp({ route: "/settings" });
    expect(await screen.findByText(/Add to Home Screen/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Install app" })).not.toBeInTheDocument();
  });

  it("always explains how to install on Settings, even when the browser offers no prompt", async () => {
    renderApp({ route: "/settings" });
    expect(await screen.findByRole("heading", { name: "Install the app" })).toBeInTheDocument();
    expect(screen.getByText(/Install app/, { selector: "strong" })).toBeInTheDocument();
  });
});
