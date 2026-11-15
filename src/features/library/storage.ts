/**
 * localStorage persistence with validation. A bad or hand-edited blob must never crash the app
 * or be silently overwritten: it is copied to a backup key first and the user is told.
 */
import { emptyLibrary, librarySchema, type Library } from "./model";

export const STORAGE_KEY = "recall-studio:library:v1";
export const BACKUP_KEY = "recall-studio:library:corrupt-backup";
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export type StorageProblem = "quota" | "unavailable";

export interface LoadResult {
  library: Library;
  /** True when stored data existed but could not be read, and was backed up. */
  recovered: boolean;
}

export function getDefaultStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null; // blocked (privacy mode / disabled cookies)
  }
}

export function loadLibrary(storage: Storage | null): LoadResult {
  if (!storage) return { library: emptyLibrary(), recovered: false };
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return { library: emptyLibrary(), recovered: false };
  }
  if (raw === null) return { library: emptyLibrary(), recovered: false };

  try {
    const parsed = librarySchema.safeParse(JSON.parse(raw));
    if (parsed.success) return { library: parsed.data, recovered: false };
  } catch {
    // fall through to recovery
  }
  try {
    storage.setItem(BACKUP_KEY, raw);
  } catch {
    // best effort
  }
  return { library: emptyLibrary(), recovered: true };
}

export function saveLibrary(storage: Storage | null, library: Library): StorageProblem | null {
  if (!storage) return "unavailable";
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(library));
    return null;
  } catch (err) {
    const name = err instanceof DOMException ? err.name : "";
    return name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED" ? "quota" : "unavailable";
  }
}

export type ImportResult = { ok: true; library: Library } | { ok: false; error: string };

/** Validates a backup file. Never throws. */
export function parseBackup(text: string): ImportResult {
  if (text.length > MAX_IMPORT_BYTES) return { ok: false, error: "That file is too large to be a Recall Studio backup." };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file isn't valid JSON." };
  }
  const parsed = librarySchema.safeParse(json);
  if (!parsed.success) return { ok: false, error: "That file isn't a Recall Studio backup, or it is damaged." };
  return { ok: true, library: parsed.data };
}

export const serializeBackup = (library: Library): string => JSON.stringify(library, null, 2);
