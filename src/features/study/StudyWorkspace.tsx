import { useEffect, useId, useRef, useState } from "react";
import { PartyPopper, Target } from "lucide-react";
import type { QuizQuestion, StudySet } from "../../../shared/contract";
import { FlashcardDeck } from "../../components/flashcards/FlashcardDeck";
import { QuizRunner } from "../../components/quiz/QuizRunner";
import { EmptyState } from "../../components/states/EmptyState";
import { Tabs, type TabDef } from "../../components/ui/Tabs";
import { tabPanelProps } from "../../components/ui/tabIds";
import { secondaryButton } from "../../components/ui/buttons";

type TabId = "flashcards" | "quiz" | "retest";

interface Props {
  studySet: StudySet;
  onNewNotes: () => void;
}

/** Retest is derived from the finished quiz: `null` means the quiz hasn't been completed yet. */
interface RetestState {
  questions: QuizQuestion[];
  runId: number;
}

export function StudyWorkspace({ studySet, onNewNotes }: Props) {
  const prefix = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  // A new study set replaces the loading view, which had focus. Move focus to the title so keyboard
  // and screen-reader users land on the new content instead of <body>.
  useEffect(() => headingRef.current?.focus(), []);
  const hasCards = studySet.flashcards.length > 0;
  const hasQuiz = studySet.quiz.length > 0;

  const [tab, setTab] = useState<TabId>(hasCards ? "flashcards" : "quiz");
  const [retest, setRetest] = useState<RetestState | null>(null);
  const [runCounter, setRunCounter] = useState(0);

  function startRetest(questions: QuizQuestion[]) {
    setRunCounter((n) => n + 1);
    setRetest({ questions, runId: runCounter + 1 });
  }

  const tabs: TabDef<TabId>[] = [];
  const panelProps = (id: TabId) => (tabs.length > 1 ? tabPanelProps(prefix, id) : {});
  if (hasCards) tabs.push({ id: "flashcards", label: "Flashcards" });
  if (hasQuiz) {
    tabs.push({ id: "quiz", label: "Quiz" });
    tabs.push({
      id: "retest",
      label: "Retest wrong",
      badge:
        retest && retest.questions.length > 0 ? (
          <span className="rounded-full bg-warm-soft px-2 py-0.5 text-xs font-semibold text-warm" aria-label={`${retest.questions.length} to retest`}>
            {retest.questions.length}
          </span>
        ) : undefined,
    });
  }

  return (
    <div className="rise-in space-y-6">
      <header className="space-y-3">
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between">
          <h2 ref={headingRef} tabIndex={-1} className="wrap-anywhere min-w-0 font-display outline-none text-3xl font-semibold leading-tight sm:text-4xl">{studySet.title}</h2>
          <button type="button" onClick={onNewNotes} className={secondaryButton}>
            Edit notes
          </button>
        </div>
        <p className="wrap-anywhere max-w-prose text-ink-muted">{studySet.summary}</p>
        <p className="text-sm font-medium text-ink-muted">
          {hasCards && `${studySet.flashcards.length} flashcards`}
          {hasCards && hasQuiz && " · "}
          {hasQuiz && `${studySet.quiz.length} quiz questions`}
        </p>
      </header>

      {tabs.length > 1 && <Tabs tabs={tabs} active={tab} onChange={setTab} label="Study modes" idPrefix={prefix} />}

      {/* Panels stay mounted (just hidden) so quiz progress survives switching tabs. */}
      {hasCards && (
        <div {...panelProps("flashcards")} hidden={tab !== "flashcards"}>
          <FlashcardDeck cards={studySet.flashcards} />
        </div>
      )}

      {hasQuiz && (
        <div {...panelProps("quiz")} hidden={tab !== "quiz"}>
          <QuizRunner
            questions={studySet.quiz}
            kind="quiz"
            onFinish={startRetest}
            onRestart={() => setRetest(null)}
            onRetestWrong={(wrong) => {
              startRetest(wrong);
              setTab("retest");
            }}
          />
        </div>
      )}

      {hasQuiz && (
        <div {...panelProps("retest")} hidden={tab !== "retest"}>
          {retest === null ? (
            <EmptyState
              icon={<Target size={32} />}
              title="Nothing to retest yet"
              action={
                <button type="button" className={secondaryButton} onClick={() => setTab("quiz")}>
                  Go to the quiz
                </button>
              }
            >
              Finish the quiz and the questions you miss will appear here so you can practise them again.
            </EmptyState>
          ) : retest.questions.length === 0 ? (
            <EmptyState icon={<PartyPopper size={32} />} title="No wrong answers — nice work!">
              You got every question right, so there's nothing to retest. Restart the quiz any time to practise again.
            </EmptyState>
          ) : (
            <QuizRunner
              key={retest.runId}
              questions={retest.questions}
              kind="retest"
              onRetestWrong={startRetest}
            />
          )}
        </div>
      )}
    </div>
  );
}
