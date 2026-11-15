import { useId, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent, type Ref } from "react";
import { FileText, Paperclip, Sparkles, X } from "lucide-react";
import { ACCEPT_ATTRIBUTE, LIMITS, validateFiles, validateSubmission, type StudyMode } from "../../../shared/contract";
import { primaryButton } from "../ui/buttons";
import { ModePicker } from "./ModePicker";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const sameFile = (a: File, b: File) => a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;

const EXAMPLES = [
  { label: "Photosynthesis", text: "Photosynthesis: how plants turn light, water and carbon dioxide into glucose and oxygen." },
  { label: "French Revolution", text: "The French Revolution: causes, key events from 1789, and its consequences for Europe." },
  { label: "TCP vs UDP", text: "TCP vs UDP: differences in reliability, ordering, speed and typical use cases." },
  { label: "Big-O notation", text: "Big-O notation: common time complexities and how to compare algorithms." },
];

interface Props {
  notes: string;
  mode: StudyMode;
  files: File[];
  onNotesChange: (notes: string) => void;
  onModeChange: (mode: StudyMode) => void;
  onFilesChange: (files: File[]) => void;
  onSubmit: () => void;
  textareaRef?: Ref<HTMLTextAreaElement>;
}

export function InputPanel({ notes, mode, files, onNotesChange, onModeChange, onFilesChange, onSubmit, textareaRef }: Props) {
  const ids = useId();
  const [showError, setShowError] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function addFiles(incoming: File[]) {
    const fresh = incoming.filter((f) => !files.some((existing) => sameFile(existing, f)));
    if (fresh.length === 0) return;
    const next = [...files, ...fresh];
    const problem = validateFiles(next);
    if (problem) {
      // Keep what's already attached; explain why the new file(s) weren't added.
      setFileError(problem);
      return;
    }
    setFileError(null);
    setShowError(false);
    onFilesChange(next);
    setAnnouncement(`${fresh.length} file${fresh.length === 1 ? "" : "s"} added. ${next.length} attached.`);
  }

  function handleFileInput(e: ChangeEvent<HTMLInputElement>) {
    addFiles(Array.from(e.target.files ?? []));
    e.target.value = ""; // allow picking the same file again after removing it
  }

  function removeFile(index: number) {
    const removed = files[index];
    onFilesChange(files.filter((_, i) => i !== index));
    setFileError(null);
    setAnnouncement(`Removed ${removed.name}. ${files.length - 1} attached.`);
    fileInputRef.current?.focus();
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    addFiles(Array.from(e.dataTransfer.files));
  }

  const length = notes.trim().length;
  const hasFiles = files.length > 0;
  const problem = validateSubmission(notes, files.length);
  const overBy = length - LIMITS.notesMax;
  const isOver = overBy > 0;
  const errorText = showError || isOver ? problem : null;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (problem) {
      setShowError(true);
      return;
    }
    setShowError(false);
    onSubmit();
  }

  const describedBy = [`${ids}-help`, `${ids}-count`, errorText ? `${ids}-error` : null].filter(Boolean).join(" ");

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5" aria-label="Create a study set">
      <div>
        <label htmlFor={`${ids}-notes`} className="mb-1.5 block text-base font-semibold">
          Your notes or topic
        </label>
        <p id={`${ids}-help`} className="mb-2 text-sm text-ink-muted">
          {hasFiles
            ? "Optional: add a focus or extra context for your attached files, for example which chapter matters most."
            : "Paste lecture notes, a textbook excerpt, or just describe a topic. No formatting needed."}
        </p>
        {/* No maxLength on purpose: silently truncating pasted notes would lose text. */}
        <textarea
          ref={textareaRef}
          id={`${ids}-notes`}
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          rows={9}
          spellCheck
          aria-describedby={describedBy}
          aria-invalid={errorText ? true : undefined}
          className={`block w-full resize-y rounded-xl border bg-surface px-4 py-3 text-base leading-relaxed shadow-inner placeholder:text-ink-muted/70 ${
            errorText ? "border-bad" : "border-line-strong"
          }`}
          placeholder="e.g. The mitochondria is the site of cellular respiration. It produces ATP through..."
        />
        <div className="mt-1.5 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
          <p id={`${ids}-error`} role={errorText ? "alert" : undefined} className="min-h-5 text-sm font-medium text-bad">
            {errorText}
          </p>
          <p id={`${ids}-count`} className={`ml-auto text-sm tabular-nums ${isOver ? "font-semibold text-bad" : "text-ink-muted"}`}>
            {length.toLocaleString()} / {LIMITS.notesMax.toLocaleString()}
            {isOver ? ` (${overBy.toLocaleString()} over)` : !hasFiles && length < LIMITS.notesMin ? ` · min ${LIMITS.notesMin}` : ""}
          </p>
        </div>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`rounded-xl border border-dashed p-4 transition-colors motion-reduce:transition-none ${
          dragging ? "border-accent bg-accent-soft" : "border-line-strong bg-surface/60"
        }`}
      >
        <p id={`${ids}-files-help`} className="text-sm text-ink-muted">
          Or attach files: PDFs, Word documents, photos or scans of notes, and text files. Drop them here or browse. Up to {LIMITS.maxFiles} files, 10 MB each.
        </p>
        <label className="mt-3 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line-strong bg-surface px-4 text-sm font-semibold hover:bg-accent-soft focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
          <Paperclip aria-hidden="true" size={18} />
          Attach files
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPT_ATTRIBUTE}
            onChange={handleFileInput}
            aria-describedby={`${ids}-files-help`}
            className="sr-only"
          />
        </label>

        {hasFiles && (
          <ul className="mt-3 space-y-2" aria-label="Attached files">
            {files.map((file, i) => (
              <li key={`${file.name}-${file.size}-${file.lastModified}`} className="flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2">
                <FileText aria-hidden="true" size={18} className="shrink-0 text-ink-muted" />
                <span className="wrap-anywhere min-w-0 flex-1 text-sm">
                  {file.name} <span className="text-ink-muted">({formatSize(file.size)})</span>
                </span>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  aria-label={`Remove ${file.name}`}
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-full hover:bg-accent-soft"
                >
                  <X aria-hidden="true" size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <p role={fileError ? "alert" : undefined} className="mt-2 min-h-5 text-sm font-medium text-bad">
          {fileError}
        </p>
        <p role="status" className="sr-only">
          {announcement}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Example topics">
        <span className="text-sm text-ink-muted">Try a topic:</span>
        {EXAMPLES.map((ex) => (
          <button
            key={ex.label}
            type="button"
            onClick={() => {
              onNotesChange(ex.text);
              setShowError(false);
            }}
            className="min-h-9 rounded-full border border-line-strong bg-surface px-3.5 text-sm text-ink transition-colors hover:bg-accent-soft motion-reduce:transition-none"
          >
            {ex.label}
          </button>
        ))}
      </div>

      <ModePicker value={mode} onChange={onModeChange} />

      <button type="submit" disabled={isOver} className={`${primaryButton} w-full sm:w-auto`}>
        <Sparkles aria-hidden="true" size={18} />
        Generate study set
      </button>
    </form>
  );
}
