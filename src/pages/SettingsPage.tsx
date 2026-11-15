import { useId, useState } from "react";
import { useOutletContext } from "react-router";
import { Download, Trash2, Upload } from "lucide-react";
import type { ShellContext } from "../components/layout/AppShell";
import { InstallSection } from "../components/layout/InstallApp";
import { PageTitle } from "../components/layout/PageTitle";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { primaryButton, secondaryButton } from "../components/ui/buttons";
import { useLibrary } from "../features/library/LibraryContext";
import { MAX_IMPORT_BYTES } from "../features/library/storage";
import { downloadText } from "../lib/download";
import { plural } from "../lib/format";
import { THEME_PREFERENCES, type ThemePreference } from "../lib/theme";

const THEME_LABELS: Record<ThemePreference, string> = { dark: "Dark", light: "Light", system: "Match my device" };

type Message = { kind: "ok" | "error"; text: string };

export function SettingsPage() {
  const ids = useId();
  const { preference, setPreference } = useOutletContext<ShellContext>();
  const lib = useLibrary();
  const { sets, folders } = lib.library;
  const cards = sets.reduce((n, s) => n + s.flashcards.length, 0);

  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  function exportBackup() {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadText(`recall-studio-backup-${stamp}.json`, lib.exportBackup());
    setMessage({ kind: "ok", text: "Backup downloaded. Keep it somewhere safe; you can import it on any device." });
  }

  function runImport(text: string, how: "merge" | "replace") {
    const result = lib.importBackup(text, how);
    setMessage(result.ok ? { kind: "ok", text: how === "replace" ? "Backup restored. Your library was replaced." : "Backup merged into your library." } : { kind: "error", text: result.error });
  }

  async function onPickFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      setMessage({ kind: "error", text: "That file is too large to be a Recall Studio backup." });
      return;
    }
    const text = await file.text();
    if (mode === "replace") setPending(text);
    else runImport(text, "merge");
  }

  return (
    <div className="space-y-10">
      <PageTitle subtitle="Appearance and your saved data.">Settings</PageTitle>

      {message && (
        <p role={message.kind === "error" ? "alert" : "status"} className={`rounded-card border p-3 text-sm font-medium ${message.kind === "error" ? "border-bad/40 bg-bad-soft text-bad" : "border-good/40 bg-good-soft text-good"}`}>
          {message.text}
        </p>
      )}

      <section aria-labelledby={`${ids}-appearance`}>
        <h2 id={`${ids}-appearance`} className="mb-3 font-display text-2xl font-semibold">
          Appearance
        </h2>
        <fieldset>
          <legend className="sr-only">Theme</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {THEME_PREFERENCES.map((t) => (
              <label key={t} className="relative">
                <input type="radio" name="theme" value={t} checked={preference === t} onChange={() => setPreference(t)} className="peer sr-only" />
                <span className="flex min-h-12 cursor-pointer items-center justify-center rounded-xl border border-line-strong bg-surface px-3 font-medium peer-checked:border-accent peer-checked:bg-accent-soft peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent">
                  {THEME_LABELS[t]}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <InstallSection headingId={`${ids}-install`} />

      <section aria-labelledby={`${ids}-data`} className="space-y-4">
        <h2 id={`${ids}-data`} className="font-display text-2xl font-semibold">
          Your data
        </h2>
        <p className="text-ink-muted">
          Everything is stored in this browser only: {plural(sets.length, "set")}, {plural(folders.length, "folder")} and {plural(cards, "card")}. Clearing your browser data deletes it, so export a backup now and then.
        </p>

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={exportBackup} className={primaryButton}>
            <Download aria-hidden="true" size={18} />
            Export backup
          </button>
        </div>

        <div className="rounded-card border border-line bg-surface p-4">
          <h3 className="font-semibold">Import a backup</h3>
          <fieldset className="mt-2">
            <legend className="sr-only">How to import</legend>
            <label className="mr-5 inline-flex items-center gap-2">
              <input type="radio" name="import-mode" checked={mode === "merge"} onChange={() => setMode("merge")} />
              Add to my library
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="radio" name="import-mode" checked={mode === "replace"} onChange={() => setMode("replace")} />
              Replace my library
            </label>
          </fieldset>
          <label className={`${secondaryButton} mt-3 cursor-pointer focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-accent`}>
            <Upload aria-hidden="true" size={18} />
            Choose backup file
            <input
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={(e) => {
                void onPickFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
        </div>

        <div>
          <button type="button" onClick={() => setConfirmClear(true)} className={secondaryButton}>
            <Trash2 aria-hidden="true" size={18} />
            Delete all my data
          </button>
        </div>
      </section>

      <section aria-labelledby={`${ids}-about`} className="space-y-2">
        <h2 id={`${ids}-about`} className="font-display text-2xl font-semibold">
          Privacy
        </h2>
        <p className="max-w-prose text-ink-muted">
          Your library never leaves this device. When you generate a study set, the notes, files or photos you provide are sent to Google's Gemini API to write it. Uploaded files are not stored by this app.
        </p>
      </section>

      <ConfirmDialog
        open={pending !== null}
        title="Replace your library?"
        confirmLabel="Replace everything"
        danger
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (pending !== null) runImport(pending, "replace");
          setPending(null);
        }}
      >
        <p>Everything you have now ({plural(sets.length, "set")}) will be replaced by the backup. This can't be undone. Export a backup first if unsure.</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmClear}
        title="Delete all your data?"
        confirmLabel="Delete everything"
        danger
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          lib.clearAll();
          setConfirmClear(false);
          setMessage({ kind: "ok", text: "All study sets and folders were deleted from this device." });
        }}
      >
        <p>
          This removes all {plural(sets.length, "set")} and {plural(folders.length, "folder")} from this browser. This can't be undone.
        </p>
      </ConfirmDialog>
    </div>
  );
}
