import { useState } from "react";
import type { StudyMode } from "../shared/contract";
import { InputPanel } from "./components/input/InputPanel";
import { ErrorBanner } from "./components/states/ErrorBanner";
import { LoadingState } from "./components/states/LoadingState";
import { StudyWorkspace } from "./features/study/StudyWorkspace";
import { useStudyGenerator } from "./hooks/useStudyGenerator";
import type { GenerateFn } from "./lib/api/studyApi";

interface Props {
  /** Injectable so tests can control timing and failures without a network. */
  generate?: GenerateFn;
}

export default function App({ generate }: Props) {
  // Notes and mode live here, above the generator, so a failed request never loses them.
  const [notes, setNotes] = useState("");
  const [mode, setMode] = useState<StudyMode>("both");
  const [editing, setEditing] = useState(false);
  const { state, run, cancel } = useStudyGenerator(generate);

  function submit() {
    setEditing(false);
    void run({ notes: notes.trim(), mode });
  }

  const showStudy = state.status === "success" && !editing;

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-surface/70">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
          <img src="/favicon.svg" alt="" width={32} height={32} className="rounded-lg" />
          <div className="min-w-0">
            <p className="font-display text-xl font-semibold leading-none">Recall Studio</p>
            <p className="mt-1 text-sm text-ink-muted">Turn your notes into flashcards and quizzes.</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        {showStudy ? (
          <StudyWorkspace key={state.studySet.id} studySet={state.studySet} onNewNotes={() => setEditing(true)} />
        ) : (
          <div className="space-y-6">
            {state.status === "idle" || state.status === "error" || state.status === "success" ? (
              <div>
                <h1 className="font-display text-3xl font-semibold leading-tight sm:text-4xl">What are you studying?</h1>
                <p className="mt-2 max-w-prose text-ink-muted">
                  Paste your notes or name a topic. We'll turn them into active-recall practice: flip cards to test your memory, then take a quiz.
                </p>
              </div>
            ) : null}

            {state.status === "error" && <ErrorBanner error={state.error} onRetry={submit} onDismiss={cancel} />}

            {state.status === "loading" ? (
              <LoadingState onCancel={cancel} />
            ) : (
              <InputPanel notes={notes} mode={mode} onNotesChange={setNotes} onModeChange={setMode} onSubmit={submit} />
            )}
          </div>
        )}
      </main>
    </div>
  );
}
