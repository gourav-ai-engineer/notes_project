import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ClipboardPaste, Plus, Trash2 } from "lucide-react";
import { LIMITS } from "../../shared/contract";
import { FolderPicker } from "../components/library/FolderPicker";
import { PageTitle } from "../components/layout/PageTitle";
import { Dialog } from "../components/ui/Dialog";
import { primaryButton, secondaryButton } from "../components/ui/buttons";
import { parseBulkCards } from "../features/library/bulkImport";
import { NEW_FOLDER, resolveFolderTarget } from "../features/library/folderTarget";
import { findSet, useLibrary } from "../features/library/LibraryContext";
import { MAX_CARDS_PER_SET, newId, type LibrarySet } from "../features/library/model";
import { NotFoundPage } from "./NotFoundPage";

interface Row {
  key: string;
  /** Existing card id, so progress and stars survive an edit. */
  id?: string;
  question: string;
  answer: string;
}

const blankRow = (): Row => ({ key: newId(), question: "", answer: "" });
const field = "block w-full rounded-xl border bg-surface px-3 py-2.5 text-base text-ink";

/** Create a manual set (`/create/manual`) or edit any saved set (`/sets/:id/edit`). */
export function EditorPage() {
  const { setId } = useParams();
  const lib = useLibrary();
  const existing = setId ? findSet(lib.library, setId) : undefined;
  if (setId && !existing) return <NotFoundPage what="study set" />;
  return <EditorForm key={setId ?? "new"} existing={existing} />;
}

function validate(title: string, rows: Row[], needsCards: boolean) {
  const rowErrors: Record<string, string> = {};
  let complete = 0;
  for (const r of rows) {
    const q = r.question.trim();
    const a = r.answer.trim();
    if (!q && !a) continue;
    if (!q || !a) rowErrors[r.key] = "Add both a question and an answer, or remove this card.";
    else if (q.length > LIMITS.question) rowErrors[r.key] = `The question is too long (max ${LIMITS.question} characters).`;
    else if (a.length > LIMITS.answer) rowErrors[r.key] = `The answer is too long (max ${LIMITS.answer} characters).`;
    else complete += 1;
  }
  return {
    title: title.trim() ? null : "Give your set a title.",
    cards: needsCards && complete === 0 && Object.keys(rowErrors).length === 0 ? "Add at least one card with a question and an answer." : null,
    tooMany: complete > MAX_CARDS_PER_SET ? `A set can hold up to ${MAX_CARDS_PER_SET} cards.` : null,
    rowErrors,
  };
}

function EditorForm({ existing }: { existing?: LibrarySet }) {
  const navigate = useNavigate();
  const lib = useLibrary();
  const [title, setTitle] = useState(existing?.title ?? "");
  const [summary, setSummary] = useState(existing?.summary ?? "");
  const [folderTarget, setFolderTarget] = useState(existing?.folderId ?? "");
  const [newFolderName, setNewFolderName] = useState("");
  const [rows, setRows] = useState<Row[]>(() =>
    existing ? existing.flashcards.map((c) => ({ key: c.id, id: c.id, question: c.question, answer: c.answer })) : [blankRow(), blankRow(), blankRow()],
  );
  const [submitted, setSubmitted] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [importing, setImporting] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkNote, setBulkNote] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);

  const hasQuiz = (existing?.quiz.length ?? 0) > 0;
  const result = validate(title, rows, !hasQuiz);
  const problems = [result.title, result.cards, result.tooMany, ...Object.values(result.rowErrors)].filter(Boolean) as string[];

  useEffect(() => {
    if (focusKey) document.getElementById(`q-${focusKey}`)?.focus();
  }, [focusKey]);

  // After a failed save, move focus to the problem summary (it only exists once `submitted` has rendered).
  useEffect(() => {
    if (attempts > 0) summaryRef.current?.focus();
  }, [attempts]);

  function updateRow(key: string, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function addRow() {
    const row = blankRow();
    setRows((rs) => [...rs, row]);
    setFocusKey(row.key);
  }

  function removeRow(key: string) {
    setRows((rs) => rs.filter((r) => r.key !== key));
    addRef.current?.focus();
  }

  function importBulk() {
    const { cards, skipped } = parseBulkCards(bulkText);
    if (cards.length === 0) {
      setBulkNote("No cards found. Put one card per line, with a Tab, \" - \", \" :: \" or \": \" between the question and the answer.");
      return;
    }
    // Replace untouched blank rows rather than leaving gaps above the imported cards.
    setRows((rs) => [...rs.filter((r) => r.question.trim() || r.answer.trim()), ...cards.map((c) => ({ key: newId(), question: c.question, answer: c.answer }))]);
    setBulkText("");
    setBulkNote(null);
    setImporting(false);
    if (skipped > 0) setBulkNote(`${skipped} line${skipped === 1 ? " was" : "s were"} skipped because they had no separator.`);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (problems.length > 0) {
      setAttempts((n) => n + 1);
      return;
    }
    if (folderTarget === NEW_FOLDER && !newFolderName.trim()) return;
    const folderId = resolveFolderTarget(folderTarget, newFolderName, (n) => lib.createFolder(n));
    const fields = { title, summary, folderId, cards: rows.map((r) => ({ id: r.id, question: r.question, answer: r.answer })) };
    if (existing) {
      lib.editSet(existing.id, fields);
      navigate(`/sets/${existing.id}`);
    } else {
      const id = lib.createManualSet(fields);
      navigate(`/sets/${id}`, { state: { saved: true } });
    }
  }

  return (
    <div>
      <PageTitle subtitle={existing ? "Change the title, folder or cards. Your progress on unchanged cards is kept." : "Write your own flashcards. No AI and no network needed."}>
        {existing ? "Edit set" : "Create a set"}
      </PageTitle>

      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        {submitted && problems.length > 0 && (
          <div ref={summaryRef} role="alert" tabIndex={-1} className="rounded-card border border-bad/40 bg-bad-soft p-4 text-sm outline-none">
            <p className="font-semibold text-bad">Fix {problems.length} {problems.length === 1 ? "problem" : "problems"} to save:</p>
            <ul className="mt-1 list-inside list-disc text-ink">
              {problems.map((p, i) => (
                <li key={i} className="wrap-anywhere">
                  {p}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <label htmlFor="set-title" className="mb-1.5 block text-base font-semibold">
            Title
          </label>
          <input
            id="set-title"
            type="text"
            value={title}
            maxLength={LIMITS.title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Cell biology: organelles"
            aria-invalid={submitted && result.title ? true : undefined}
            className={`${field} ${submitted && result.title ? "border-bad" : "border-line-strong"}`}
          />
        </div>

        <div>
          <label htmlFor="set-summary" className="mb-1.5 block text-base font-semibold">
            Description <span className="font-normal text-ink-muted">(optional)</span>
          </label>
          <textarea id="set-summary" value={summary} maxLength={LIMITS.summary} rows={2} onChange={(e) => setSummary(e.target.value)} className={`${field} border-line-strong`} />
        </div>

        <FolderPicker folders={lib.library.folders} value={folderTarget} newName={newFolderName} onChange={setFolderTarget} onNewNameChange={setNewFolderName} label="Folder" />

        <section aria-labelledby="cards-heading" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="cards-heading" className="font-display text-2xl font-semibold">
              Cards ({rows.filter((r) => r.question.trim() && r.answer.trim()).length})
            </h2>
            <button type="button" onClick={() => setImporting(true)} className={secondaryButton}>
              <ClipboardPaste aria-hidden="true" size={18} />
              Import from text
            </button>
          </div>
          {hasQuiz && <p className="text-sm text-ink-muted">This set also has a quiz. Quiz questions aren't edited here, and changing cards won't change them.</p>}
          {bulkNote && (
            <p role="status" className="text-sm text-ink-muted">
              {bulkNote}
            </p>
          )}

          <ol className="space-y-4">
            {rows.map((row, i) => {
              const error = submitted ? result.rowErrors[row.key] : undefined;
              return (
                <li key={row.key}>
                  <fieldset className={`rounded-card border bg-surface p-4 ${error ? "border-bad" : "border-line"}`}>
                    <legend className="px-1 text-sm font-semibold text-ink-muted">Card {i + 1}</legend>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <label htmlFor={`q-${row.key}`} className="mb-1 block text-sm font-medium">
                          Question <span className="sr-only">for card {i + 1}</span>
                        </label>
                        <textarea id={`q-${row.key}`} value={row.question} rows={2} onChange={(e) => updateRow(row.key, { question: e.target.value })} className={`${field} border-line-strong`} />
                      </div>
                      <div>
                        <label htmlFor={`a-${row.key}`} className="mb-1 block text-sm font-medium">
                          Answer <span className="sr-only">for card {i + 1}</span>
                        </label>
                        <textarea id={`a-${row.key}`} value={row.answer} rows={2} onChange={(e) => updateRow(row.key, { answer: e.target.value })} className={`${field} border-line-strong`} />
                      </div>
                    </div>
                    {error && (
                      <p className="mt-2 text-sm font-medium text-bad" role="alert">
                        {error}
                      </p>
                    )}
                    <div className="mt-3 flex justify-end">
                      <button type="button" onClick={() => removeRow(row.key)} aria-label={`Remove card ${i + 1}`} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-sm text-ink-muted hover:bg-accent-soft hover:text-ink">
                        <Trash2 aria-hidden="true" size={16} />
                        Remove
                      </button>
                    </div>
                  </fieldset>
                </li>
              );
            })}
          </ol>

          <button ref={addRef} type="button" onClick={addRow} disabled={rows.length >= MAX_CARDS_PER_SET} className={secondaryButton}>
            <Plus aria-hidden="true" size={18} />
            Add card
          </button>
        </section>

        <div className="flex flex-wrap gap-2 border-t border-line pt-6">
          <button type="submit" className={primaryButton}>
            {existing ? "Save changes" : "Create set"}
          </button>
          <Link to={existing ? `/sets/${existing.id}` : "/library"} className={secondaryButton}>
            Cancel
          </Link>
        </div>
      </form>

      <Dialog open={importing} title="Import cards from text" onClose={() => setImporting(false)}>
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">
            Paste one card per line. Put a Tab (from a spreadsheet), <code>{" - "}</code>, <code>{" :: "}</code> or <code>{": "}</code> between the question and the answer.
          </p>
          <div>
            <label htmlFor="bulk-text" className="mb-1.5 block text-sm font-semibold">
              Cards to import
            </label>
            <textarea id="bulk-text" value={bulkText} rows={8} onChange={(e) => setBulkText(e.target.value)} placeholder={"Mitochondria - Makes ATP\nNucleus - Stores DNA"} className={`${field} border-line-strong`} />
          </div>
          {bulkNote && importing && (
            <p role="alert" className="text-sm font-medium text-bad">
              {bulkNote}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => setImporting(false)} className={secondaryButton}>
              Cancel
            </button>
            <button type="button" onClick={importBulk} className={primaryButton}>
              Add cards
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
