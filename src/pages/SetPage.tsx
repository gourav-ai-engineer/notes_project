import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { ChevronRight, Copy, FolderInput, Pencil, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import { FolderPicker } from "../components/library/FolderPicker";
import { PageTitle } from "../components/layout/PageTitle";
import { ErrorBanner } from "../components/states/ErrorBanner";
import { LoadingState } from "../components/states/LoadingState";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { Dialog } from "../components/ui/Dialog";
import { ProgressBar } from "../components/ui/ProgressBar";
import { primaryButton, secondaryButton } from "../components/ui/buttons";
import { StudyWorkspace } from "../features/study/StudyWorkspace";
import { cardsToNotes } from "../features/library/cardsToNotes";
import { NEW_FOLDER, resolveFolderTarget } from "../features/library/folderTarget";
import { findFolder, findSet, useLibrary } from "../features/library/LibraryContext";
import { cardProgress } from "../features/library/model";
import { useStudyGenerator } from "../hooks/useStudyGenerator";
import type { GenerateFn } from "../lib/api/studyApi";
import { NotFoundPage } from "./NotFoundPage";

interface Props {
  generate?: GenerateFn;
}

export function SetPage({ generate }: Props) {
  const { setId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const lib = useLibrary();
  const set = findSet(lib.library, setId);
  const folder = set?.folderId ? findFolder(lib.library, set.folderId) : undefined;

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [moving, setMoving] = useState(false);
  const [moveTarget, setMoveTarget] = useState("");
  const [moveName, setMoveName] = useState("");

  // "Make a quiz from these cards" reuses the same request-safe generator as the Create flow.
  const { state, run, cancel } = useStudyGenerator(generate);
  const attached = useRef<string | null>(null);
  const [usedCards, setUsedCards] = useState<number | null>(null);

  const setQuiz = lib.setQuiz;
  const setIdForQuiz = set?.id;
  useEffect(() => {
    // Guarded by a ref so StrictMode's double effect (or a re-render) attaches the quiz once.
    if (state.status === "success" && setIdForQuiz && attached.current !== state.studySet.id) {
      attached.current = state.studySet.id;
      setQuiz(setIdForQuiz, state.studySet.quiz);
    }
  }, [state, setIdForQuiz, setQuiz]);

  if (!set) return <NotFoundPage what="study set" />;

  const progress = cardProgress(set.flashcards);
  const saved = (location.state as { saved?: boolean } | null)?.saved === true;
  const canMakeQuiz = set.quiz.length === 0 && set.flashcards.length >= 3;

  function makeQuiz() {
    const { text, used } = cardsToNotes(set!.flashcards);
    setUsedCards(used);
    void run({ notes: text, mode: "quiz" });
  }

  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-sm text-ink-muted">
        <Link to="/library" className="underline-offset-2 hover:underline">
          Library
        </Link>
        <ChevronRight aria-hidden="true" size={14} />
        {folder ? (
          <Link to={`/folders/${folder.id}`} className="wrap-anywhere underline-offset-2 hover:underline">
            {folder.name}
          </Link>
        ) : (
          <Link to="/folders/unsorted" className="underline-offset-2 hover:underline">
            Unsorted
          </Link>
        )}
      </nav>

      {saved && (
        <p role="status" className="rise-in rounded-card border border-good/40 bg-good-soft p-3 text-sm font-medium text-good">
          Saved to your library{folder ? ` in “${folder.name}”` : ""}. It stays on this device.
        </p>
      )}

      <div>
        <PageTitle subtitle={set.summary || undefined}>{set.title}</PageTitle>
        <p className="-mt-3 mb-4 text-sm font-medium text-ink-muted">
          {set.flashcards.length > 0 && `${set.flashcards.length} flashcards`}
          {set.flashcards.length > 0 && set.quiz.length > 0 && " · "}
          {set.quiz.length > 0 && `${set.quiz.length} quiz questions`}
          {set.quizBest && ` · Best quiz score ${set.quizBest.correct}/${set.quizBest.total}`}
        </p>

        <div className="flex flex-wrap gap-2">
          <Link to={`/sets/${set.id}/edit`} className={secondaryButton}>
            <Pencil aria-hidden="true" size={18} />
            Edit
          </Link>
          <button
            type="button"
            className={secondaryButton}
            onClick={() => {
              setMoveTarget(set.folderId ?? "");
              setMoveName("");
              setMoving(true);
            }}
          >
            <FolderInput aria-hidden="true" size={18} />
            Move
          </button>
          <button
            type="button"
            className={secondaryButton}
            onClick={() => {
              const id = lib.duplicateSet(set.id);
              if (id) navigate(`/sets/${id}`);
            }}
          >
            <Copy aria-hidden="true" size={18} />
            Duplicate
          </button>
          <button type="button" className={secondaryButton} onClick={() => setConfirmDelete(true)}>
            <Trash2 aria-hidden="true" size={18} />
            Delete
          </button>
        </div>

        {progress.total > 0 && (
          <div className="mt-5 rounded-card border border-line bg-surface p-4">
            <div className="flex items-center justify-between gap-3 text-sm">
              <p className="font-semibold">
                Progress: {progress.known} of {progress.total} cards known ({progress.percent}%)
              </p>
              {(progress.known > 0 || progress.learning > 0 || set.quizBest) && (
                <button type="button" onClick={() => setConfirmReset(true)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-ink-muted hover:bg-accent-soft hover:text-ink">
                  <RotateCcw aria-hidden="true" size={16} />
                  Reset
                </button>
              )}
            </div>
            <div className="mt-2">
              <ProgressBar value={progress.known} max={progress.total} label="Cards known" />
            </div>
          </div>
        )}
      </div>

      {canMakeQuiz && state.status === "idle" && (
        <div className="rounded-card border border-dashed border-line-strong p-4">
          <p className="font-semibold">Add a quiz to this set</p>
          <p className="mt-1 text-sm text-ink-muted">We'll write multiple-choice questions from your flashcards. Your cards are sent to the AI to do this.</p>
          <button type="button" onClick={makeQuiz} className={`${primaryButton} mt-3`}>
            <Sparkles aria-hidden="true" size={18} />
            Make a quiz from these cards
          </button>
        </div>
      )}
      {state.status === "loading" && <LoadingState onCancel={cancel} />}
      {state.status === "error" && <ErrorBanner error={state.error} onRetry={makeQuiz} onDismiss={cancel} />}
      {usedCards !== null && usedCards < set.flashcards.length && state.status !== "idle" && (
        <p className="text-sm text-ink-muted">Only the first {usedCards} cards fit in one request, so the quiz covers those.</p>
      )}

      <StudyWorkspace key={set.id} set={set} />

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this study set?"
        confirmLabel="Delete set"
        danger
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          lib.deleteSet(set.id);
          navigate(folder ? `/folders/${folder.id}` : "/library", { replace: true });
        }}
      >
        <p className="wrap-anywhere">“{set.title}” and your progress on it will be removed from this device. This can't be undone.</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmReset}
        title="Reset your progress?"
        confirmLabel="Reset progress"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          lib.resetProgress(set.id);
          setConfirmReset(false);
        }}
      >
        <p>Every card goes back to “new” and your best quiz score is cleared. Stars are kept.</p>
      </ConfirmDialog>

      <Dialog open={moving} title="Move to folder" onClose={() => setMoving(false)}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (moveTarget === NEW_FOLDER && !moveName.trim()) return;
            lib.moveSet(set.id, resolveFolderTarget(moveTarget, moveName, (n) => lib.createFolder(n)));
            setMoving(false);
          }}
          className="space-y-5"
        >
          <FolderPicker folders={lib.library.folders} value={moveTarget} newName={moveName} onChange={setMoveTarget} onNewNameChange={setMoveName} label="Folder" />
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => setMoving(false)} className={secondaryButton}>
              Cancel
            </button>
            <button type="submit" className={primaryButton}>
              Move
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
