import { useSyncExternalStore } from "react";

/** Chrome/Edge/Samsung Internet fire this when the site can be installed. It is not in TypeScript's DOM types. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * installed  – already running as an installed app (or just installed)
 * available  – the browser gave us an install prompt we can trigger from a button
 * ios        – iPhone/iPad Safari: no prompt exists, the user must use Share > Add to Home Screen
 * manual     – anything else: show where the browser's own install option usually is
 */
export type InstallStatus = "installed" | "available" | "ios" | "manual";
export type InstallOutcome = "accepted" | "dismissed" | "unavailable";

// The browser fires `beforeinstallprompt` once, often before any screen mounts, so it is captured here at module load
// and screens subscribe to it. Keeping it outside React state means no screen can miss it.
let deferred: BeforeInstallPromptEvent | null = null;
let justInstalled = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault(); // we show our own button instead of the browser's mini-bar
    deferred = event as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    justInstalled = true;
    deferred = null;
    emit();
  });
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const displayMode = typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches;
  return displayMode || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  // iPadOS reports itself as a Mac, so touch support is the tell.
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function getInstallStatus(): InstallStatus {
  if (justInstalled || isStandalone()) return "installed";
  if (deferred) return "available";
  return isIos() ? "ios" : "manual";
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useInstallStatus(): InstallStatus {
  return useSyncExternalStore(subscribe, getInstallStatus, () => "manual");
}

/** Shows the browser's install dialog. The prompt can only be used once, so it is dropped afterwards either way. */
export async function promptInstall(): Promise<InstallOutcome> {
  const event = deferred;
  if (!event) return "unavailable";
  try {
    await event.prompt();
    const { outcome } = await event.userChoice;
    return outcome;
  } catch {
    return "unavailable";
  } finally {
    deferred = null;
    emit();
  }
}

/** Test helper: forget any captured prompt and install state. */
export function resetInstallStateForTests() {
  deferred = null;
  justInstalled = false;
  emit();
}
