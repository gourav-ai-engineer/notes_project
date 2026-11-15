// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LIMITS, type StudySet } from "../../shared/contract";
import { renderApp } from "./renderApp";
import { ApiClientError, type GenerateFn } from "../../src/lib/api/studyApi";
import { SAMPLE_NOTES, makeStudySet } from "../fixtures/study";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const ok = (set: StudySet = makeStudySet()): GenerateFn => vi.fn(async () => set);

async function generateWith(generate: GenerateFn, notes = SAMPLE_NOTES) {
  const user = userEvent.setup();
  renderApp({ generate: generate });
  await user.click(screen.getByLabelText(/your notes or topic/i));
  await user.paste(notes);
  await user.click(screen.getByRole("button", { name: /generate study set/i }));
  return user;
}

describe("input form", () => {
  it("shows the initial empty state with a labelled textarea and mode choices", () => {
    renderApp({ generate: ok() });
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByLabelText(/your notes or topic/i)).toHaveValue("");
    expect(screen.getByRole("radio", { name: /^Both/ })).toBeChecked();
    expect(screen.getByText(`0 / ${LIMITS.notesMax.toLocaleString()} · min ${LIMITS.notesMin}`)).toBeInTheDocument();
  });

  it("rejects empty and too-short input without calling the API", async () => {
    const generate = ok();
    const user = userEvent.setup();
    renderApp({ generate: generate });

    await user.click(screen.getByRole("button", { name: /generate study set/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/paste some notes/i);

    await user.type(screen.getByLabelText(/your notes or topic/i), "too short");
    await user.click(screen.getByRole("button", { name: /generate study set/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/at least 20/i);
    expect(generate).not.toHaveBeenCalled();
  });

  it("does not truncate over-limit text; flags it and disables Generate", async () => {
    const user = userEvent.setup();
    renderApp({ generate: ok() });
    const box = screen.getByLabelText(/your notes or topic/i);
    const long = "a".repeat(LIMITS.notesMax + 25);
    await user.click(box);
    await user.paste(long);

    expect(box).toHaveValue(long); // nothing silently dropped
    expect(screen.getByRole("alert")).toHaveTextContent(/too long/i);
    expect(screen.getByText(/25 over/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /generate study set/i })).toBeDisabled();
  });

  it("example chips fill the textarea", async () => {
    const user = userEvent.setup();
    renderApp({ generate: ok() });
    await user.click(screen.getByRole("button", { name: "TCP vs UDP" }));
    expect((screen.getByLabelText(/your notes or topic/i) as HTMLTextAreaElement).value).toContain("TCP vs UDP");
  });

  it("sends trimmed notes and the selected mode", async () => {
    const generate = ok();
    const user = userEvent.setup();
    renderApp({ generate: generate });
    await user.click(screen.getByRole("radio", { name: /^Quiz/ }));
    await user.click(screen.getByLabelText(/your notes or topic/i));
    await user.paste(`   ${SAMPLE_NOTES}   `);
    await user.click(screen.getByRole("button", { name: /generate study set/i }));
    expect(generate).toHaveBeenCalledWith({ notes: SAMPLE_NOTES, mode: "quiz" }, expect.anything());
  });
});

describe("loading, errors and retry", () => {
  it("shows a loading status, and Cancel returns to the form with notes intact", async () => {
    const d = deferred<StudySet>();
    const user = await generateWith(vi.fn(() => d.promise));
    expect(screen.getByRole("status")).toHaveTextContent(/writing your study set/i);
    expect(screen.queryByLabelText(/your notes or topic/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByLabelText(/your notes or topic/i)).toHaveValue(SAMPLE_NOTES);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("failure keeps notes and mode, offers Retry, and Retry succeeds", async () => {
    const generate = vi
      .fn<GenerateFn>()
      .mockRejectedValueOnce(new ApiClientError("AI_INVALID_OUTPUT", "The study set could not be generated reliably.", true, "req-9"))
      .mockResolvedValueOnce(makeStudySet());
    const user = userEvent.setup();
    renderApp({ generate: generate });
    await user.click(screen.getByRole("radio", { name: /^Flashcards/ }));
    await user.click(screen.getByLabelText(/your notes or topic/i));
    await user.paste(SAMPLE_NOTES);
    await user.click(screen.getByRole("button", { name: /generate study set/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/couldn't be used/i);
    expect(alert).toHaveTextContent("req-9");
    expect(screen.getByLabelText(/your notes or topic/i)).toHaveValue(SAMPLE_NOTES);
    expect(screen.getByRole("radio", { name: /^Flashcards/ })).toBeChecked();

    await user.click(within(alert).getByRole("button", { name: /try again/i }));
    expect(await screen.findByRole("heading", { name: "Photosynthesis" })).toBeInTheDocument();
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate).toHaveBeenLastCalledWith({ notes: SAMPLE_NOTES, mode: "flashcards" }, expect.anything());
  });

  it("hides Retry for non-retryable errors but still lets the user edit", async () => {
    const generate: GenerateFn = vi.fn().mockRejectedValue(new ApiClientError("AI_NOT_CONFIGURED", "Add a GEMINI_API_KEY.", false));
    const user = await generateWith(generate);
    const alert = await screen.findByRole("alert");
    expect(within(alert).queryByRole("button", { name: /try again/i })).not.toBeInTheDocument();
    await user.click(within(alert).getByRole("button", { name: /edit my notes/i }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/your notes or topic/i)).toHaveValue(SAMPLE_NOTES);
  });

  it("an unexpected exception becomes a friendly error, not a crash", async () => {
    await generateWith(vi.fn().mockRejectedValue(new Error("boom")));
    expect(await screen.findByRole("alert")).toHaveTextContent(/something went wrong/i);
  });

  it("a superseded request's late result never replaces the newer set", async () => {
    const a = deferred<StudySet>();
    const b = deferred<StudySet>();
    const generate = vi.fn<GenerateFn>().mockImplementationOnce(() => a.promise).mockImplementationOnce(() => b.promise);
    const user = await generateWith(generate); // request A in flight
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: /generate study set/i })); // request B

    b.resolve(makeStudySet({ id: "B", title: "Newest set" }));
    expect(await screen.findByRole("heading", { name: "Newest set" })).toBeInTheDocument();

    a.resolve(makeStudySet({ id: "A", title: "Stale set" }));
    await Promise.resolve();
    expect(screen.getByRole("heading", { name: "Newest set" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Stale set" })).not.toBeInTheDocument();
  });
});

describe("focus management", () => {
  it("moves focus to the loading panel, then the new title, and back to the notes after Cancel", async () => {
    const d = deferred<StudySet>();
    const user = await generateWith(vi.fn(() => d.promise));
    // Focus is moved in an effect, so wait for it to land instead of asserting on the same tick (that raced under load).
    await waitFor(() => expect(screen.getByRole("status")).toHaveFocus());

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.getByLabelText(/your notes or topic/i)).toHaveFocus());

    await user.click(screen.getByRole("button", { name: /generate study set/i }));
    d.resolve(makeStudySet());
    const title = await screen.findByRole("heading", { name: "Photosynthesis" });
    await waitFor(() => expect(title).toHaveFocus());
  });
});

describe("mode-specific workspace", () => {
  it("flashcards-only sets show no Quiz or Retest tab", async () => {
    await generateWith(ok(makeStudySet({ mode: "flashcards", quiz: [] })));
    await screen.findByRole("heading", { name: "Photosynthesis" });
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.getByTestId("flashcard")).toBeInTheDocument();
  });

  it("quiz-only sets open on the quiz and show no Flashcards tab", async () => {
    await generateWith(ok(makeStudySet({ mode: "quiz", flashcards: [] })));
    await screen.findByRole("heading", { name: "Photosynthesis" });
    expect(screen.queryByRole("tab", { name: "Flashcards" })).not.toBeInTheDocument();
    expect(screen.getByTestId("question-progress")).toHaveTextContent("Question 1 of 3");
  });
});

describe("flashcards", () => {
  it("flips the card, navigates, and respects first/last boundaries", async () => {
    const user = await generateWith(ok());
    await screen.findByTestId("flashcard");

    const progress = screen.getByTestId("card-progress");
    const prev = screen.getByRole("button", { name: /previous/i });
    const next = screen.getByRole("button", { name: /next$/i });
    expect(progress).toHaveTextContent("Card 1 of 3");
    expect(prev).toBeDisabled();

    const card = screen.getByTestId("flashcard");
    expect(card).toHaveAttribute("data-flipped", "false");
    await user.click(card);
    expect(card).toHaveAttribute("data-flipped", "true");
    expect(screen.getAllByText("In the chloroplasts.")[0]).toBeVisible();
    await user.click(card);
    expect(card).toHaveAttribute("data-flipped", "false");

    await user.click(card); // flip, then move on: the next card starts face-up
    await user.click(next);
    expect(progress).toHaveTextContent("Card 2 of 3");
    expect(screen.getByTestId("flashcard")).toHaveAttribute("data-flipped", "false");

    await user.click(next);
    expect(progress).toHaveTextContent("Card 3 of 3");
    expect(next).toBeDisabled();
    await user.click(prev);
    expect(progress).toHaveTextContent("Card 2 of 3");
  });

  it("supports keyboard: Space flips, arrows navigate while the card has focus", async () => {
    const user = await generateWith(ok());
    const card = await screen.findByTestId("flashcard");
    card.focus();
    await user.keyboard(" ");
    expect(card).toHaveAttribute("data-flipped", "true");
    await user.keyboard("{ArrowRight}");
    expect(screen.getByTestId("card-progress")).toHaveTextContent("Card 2 of 3");
    await user.keyboard("{ArrowLeft}{ArrowLeft}"); // clamps at the first card
    expect(screen.getByTestId("card-progress")).toHaveTextContent("Card 1 of 3");
  });

  it("hides the inactive face from assistive tech", async () => {
    const user = await generateWith(ok());
    const card = await screen.findByTestId("flashcard");
    expect(card).toHaveAccessibleName(/Where does photosynthesis occur/);
    await user.click(card);
    expect(card).toHaveAccessibleName(/In the chloroplasts/);
  });
});

async function openQuiz() {
  const user = await generateWith(ok());
  await user.click(await screen.findByRole("tab", { name: "Quiz" }));
  return user;
}

// correct indexes in the fixture are 1, 2, 1 -> option labels
async function answerQuestion(user: ReturnType<typeof userEvent.setup>, optionText: string, last = false) {
  await user.click(screen.getByRole("radio", { name: new RegExp(optionText) }));
  await user.click(screen.getByRole("button", { name: /check answer/i }));
  await user.click(screen.getByRole("button", { name: last ? /see results/i : /next question/i }));
}

describe("quiz", () => {
  it("selecting does not reveal the answer; checking shows feedback and explanation; answer then locks", async () => {
    const user = await openQuiz();
    const next = screen.getByRole("button", { name: /check answer/i });
    expect(next).toBeDisabled();

    await user.click(screen.getByRole("radio", { name: /Nucleus/ }));
    expect(screen.queryByTestId("feedback")).not.toBeInTheDocument();
    expect(screen.queryByText(/correct answer/i)).not.toBeInTheDocument();
    expect(screen.getByTestId("question-progress")).toHaveTextContent("Question 1 of 3");

    await user.click(screen.getByRole("button", { name: /check answer/i }));
    const feedback = screen.getByTestId("feedback");
    expect(feedback).toHaveTextContent("Incorrect");
    expect(feedback).toHaveTextContent(/The correct answer is B\. Chloroplast/);
    expect(feedback).toHaveTextContent("Chloroplasts contain chlorophyll");
    expect(screen.getByRole("radio", { name: /Chloroplast/ })).toBeDisabled(); // locked
  });

  it("calculates the score and offers Retest only for missed questions", async () => {
    const user = await openQuiz();
    await answerQuestion(user, "Chloroplast"); // right
    await answerQuestion(user, "Nitrogen"); // wrong (correct: Oxygen)
    await answerQuestion(user, "Stores glucose", true); // wrong (correct: Absorbs light)

    expect(screen.getByTestId("score")).toHaveTextContent("1 / 3");
    expect(screen.getByTestId("correct-count")).toHaveTextContent("1");
    expect(screen.getByTestId("incorrect-count")).toHaveTextContent("2");

    await user.click(screen.getByRole("button", { name: /retest wrong answers/i }));
    expect(await screen.findByRole("tab", { name: /retest wrong/i, selected: true })).toBeInTheDocument();
    const retestPanel = screen.getByRole("tabpanel", { name: /retest wrong/i });
    expect(within(retestPanel).getByText("Question 1 of 2")).toBeInTheDocument();
    // Only the two missed questions, with original content.
    expect(within(retestPanel).getByText("Which gas is released?")).toBeInTheDocument();

    await answerQuestion(user, "Oxygen"); // now right
    await answerQuestion(user, "Absorbs light", true); // now right
    expect(within(retestPanel).getByTestId("score")).toHaveTextContent("2 / 2");
    expect(within(retestPanel).getByText(/every one of them right/i)).toBeInTheDocument();
    expect(within(retestPanel).queryByRole("button", { name: /retest wrong answers/i })).not.toBeInTheDocument();
  });

  it("a perfect score shows a positive state and no retest button", async () => {
    const user = await openQuiz();
    await answerQuestion(user, "Chloroplast");
    await answerQuestion(user, "Oxygen");
    await answerQuestion(user, "Absorbs light", true);

    const quizPanel = screen.getByRole("tabpanel", { name: "Quiz" });
    expect(within(quizPanel).getByTestId("score")).toHaveTextContent("3 / 3");
    expect(within(quizPanel).getByText(/perfect score/i)).toBeInTheDocument();
    expect(within(quizPanel).queryByRole("button", { name: /retest wrong answers/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /retest wrong/i }));
    expect(screen.getByRole("heading", { name: /no wrong answers/i })).toBeInTheDocument();
  });

  it("the Retest tab explains itself before the quiz is finished", async () => {
    const user = await openQuiz();
    await user.click(screen.getByRole("tab", { name: /retest wrong/i }));
    expect(screen.getByRole("heading", { name: /nothing to retest yet/i })).toBeInTheDocument();
  });

  it("restart quiz clears results and the retest list", async () => {
    const user = await openQuiz();
    await answerQuestion(user, "Nucleus");
    await answerQuestion(user, "Nitrogen");
    await answerQuestion(user, "Stores glucose", true);
    await user.click(screen.getByRole("button", { name: /restart quiz/i }));
    expect(screen.getByTestId("question-progress")).toHaveTextContent("Question 1 of 3");
    await user.click(screen.getByRole("tab", { name: /retest wrong/i }));
    expect(screen.getByRole("heading", { name: /nothing to retest yet/i })).toBeInTheDocument();
  });

  it("quiz progress survives switching tabs", async () => {
    const user = await openQuiz();
    await answerQuestion(user, "Chloroplast");
    await user.click(screen.getByRole("tab", { name: "Flashcards" }));
    await user.click(screen.getByRole("tab", { name: "Quiz" }));
    expect(screen.getByTestId("question-progress")).toHaveTextContent("Question 2 of 3");
  });
});

describe("long unbroken model text", () => {
  it("renders it as plain text with wrapping classes (no HTML injection)", async () => {
    const evil = "<img src=x onerror=alert(1)>" + "W".repeat(300);
    const set = makeStudySet();
    set.flashcards[0].question = evil;
    await generateWith(ok(set));
    const card = await screen.findByTestId("flashcard");
    expect(card.querySelector("img")).toBeNull();
    expect(card).toHaveTextContent("<img src=x onerror=alert(1)>");
    expect(card.querySelector(".wrap-anywhere")).not.toBeNull();
  });
});
