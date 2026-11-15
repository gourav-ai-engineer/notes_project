import { useId, useState } from "react";
import { PartyPopper, Target } from "lucide-react";
import type { QuizQuestion } from "../../../shared/contract";
import { FlashcardDeck } from "../../components/flashcards/FlashcardDeck";
import { QuizRunner } from "../../components/quiz/QuizRunner";
import { EmptyState } from "../../components/states/EmptyState";
import { Tabs, type TabDef } from "../../components/ui/Tabs";
import { tabPanelProps } from "../../components/ui/tabIds";
import { secondaryButton } from "../../components/ui/buttons";
import { useLibrary } from "../library/LibraryContext";
import type { LibrarySet } from "../library/model";

type TabId = "flashcards" | "quiz" | "retest";

interface Props {
  /** Read from the library on every render, so stars and progress update live. */
  set: LibrarySet;
}

/** Retest is derived from the finished quiz: `null` means the quiz hasn't been completed yet. */
interface RetestState {
  questions: QuizQuestion[];
  runId: number;
}

export function StudyWorkspace({ set }: Props) {
  const prefix = useId();
  const lib = useLibrary();
  const hasCards = set.flashcards.length > 0;
  const hasQuiz = set.quiz.length > 0;

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
    <div className="space-y-6">
      {tabs.length > 1 && <Tabs tabs={tabs} active={tab} onChange={setTab} label="Study modes" idPrefix={prefix} />}

      {/* Panels stay mounted (just hidden) so quiz progress survives switching tabs. */}
      {hasCards && (
        <div {...panelProps("flashcards")} hidden={tab !== "flashcards"}>
          <FlashcardDeck
            cards={set.flashcards}
            onToggleStar={(cardId) => lib.toggleStar(set.id, cardId)}
            onSetStatus={(cardId, status) => lib.setCardStatus(set.id, cardId, status)}
            onStudied={() => lib.recordStudy(set.id)}
          />
        </div>
      )}

      {hasQuiz && (
        <div {...panelProps("quiz")} hidden={tab !== "quiz"}>
          <QuizRunner
            questions={set.quiz}
            kind="quiz"
            onChecked={() => lib.recordStudy(set.id)}
            onFinish={(wrong, score) => {
              startRetest(wrong);
              lib.recordQuiz(set.id, score.correct, score.total);
            }}
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
            <QuizRunner key={retest.runId} questions={retest.questions} kind="retest" onRetestWrong={startRetest} />
          )}
        </div>
      )}
    </div>
  );
}
