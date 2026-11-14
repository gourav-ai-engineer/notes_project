import { describe, expect, it } from "vitest";
import {
  computeScore,
  getWrongQuestions,
  initQuizSession,
  quizReducer,
  type QuizAction,
  type QuizSessionState,
} from "../../src/features/study/quizSession";
import { makeStudySet } from "../fixtures/study";

const questions = makeStudySet().quiz; // correct indexes: 1, 2, 1

function play(state: QuizSessionState, actions: QuizAction[]) {
  return actions.reduce(quizReducer, state);
}
const answer = (i: number): QuizAction[] => [{ type: "select", optionIndex: i }, { type: "check" }];

describe("quiz session", () => {
  it("selecting does not advance or record an answer", () => {
    const s = play(initQuizSession(questions), [{ type: "select", optionIndex: 0 }]);
    expect(s.index).toBe(0);
    expect(s.checked).toBe(false);
    expect(s.answers).toHaveLength(0);
  });

  it("cannot check without a selection", () => {
    const s = play(initQuizSession(questions), [{ type: "check" }]);
    expect(s.checked).toBe(false);
    expect(s.answers).toHaveLength(0);
  });

  it("locks the answer after checking", () => {
    const s = play(initQuizSession(questions), [...answer(0), { type: "select", optionIndex: 1 }, { type: "check" }]);
    expect(s.selected).toBe(0);
    expect(s.answers).toHaveLength(1);
    expect(s.answers[0]).toMatchObject({ selectedIndex: 0, correct: false });
  });

  it("cannot advance before checking", () => {
    const s = play(initQuizSession(questions), [{ type: "select", optionIndex: 1 }, { type: "next" }]);
    expect(s.index).toBe(0);
  });

  it("scores from the user's answers and finishes after the last question", () => {
    // correct, wrong, correct
    const s = play(initQuizSession(questions), [
      ...answer(1), { type: "next" },
      ...answer(0), { type: "next" },
      ...answer(1), { type: "next" },
    ]);
    expect(s.finished).toBe(true);
    expect(computeScore(s.answers, questions.length)).toEqual({ total: 3, correct: 2, incorrect: 1, percent: 67 });
  });

  it("collects only the wrongly answered questions, unchanged", () => {
    const s = play(initQuizSession(questions), [
      ...answer(1), { type: "next" },
      ...answer(0), { type: "next" },
      ...answer(3), { type: "next" },
    ]);
    const wrong = getWrongQuestions(s);
    expect(wrong.map((q) => q.id)).toEqual(["q2", "q3"]);
    expect(wrong[0]).toBe(questions[1]); // original correct answer and explanation preserved
  });

  it("returns no wrong questions for a perfect run", () => {
    const s = play(initQuizSession(questions), [
      ...answer(1), { type: "next" },
      ...answer(2), { type: "next" },
      ...answer(1), { type: "next" },
    ]);
    expect(getWrongQuestions(s)).toEqual([]);
    expect(computeScore(s.answers, 3).percent).toBe(100);
  });

  it("restart clears progress but keeps the questions", () => {
    const s = play(initQuizSession(questions), [...answer(0), { type: "restart" }]);
    expect(s).toEqual(initQuizSession(questions));
  });

  it("handles an empty question list without dividing by zero", () => {
    expect(computeScore([], 0).percent).toBe(0);
  });
});
