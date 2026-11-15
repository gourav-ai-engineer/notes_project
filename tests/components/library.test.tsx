// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { StudySet } from "../../shared/contract";
import { BACKUP_KEY, STORAGE_KEY } from "../../src/features/library/storage";
import { ApiClientError, type GenerateFn } from "../../src/lib/api/studyApi";
import { aiSet, folder, library, manualSet, readLibrary, seedStorage } from "../fixtures/library";
import { memoryStorage } from "../fixtures/storage";
import { SAMPLE_NOTES, makeStudySet } from "../fixtures/study";
import { renderApp } from "./renderApp";

const ok = (set: StudySet = makeStudySet()): GenerateFn => vi.fn(async () => set);
const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => (resolve = res));
  return { promise, resolve };
};

function seeded(lib = library(), route = "/") {
  const storage = memoryStorage();
  seedStorage(storage, lib);
  return { ...renderApp({ route, storage }), storage };
}

const nav = () => within(screen.getByRole("navigation", { name: "Primary" }));

describe("navigation and Create menu", () => {
  it("shows an inviting empty Home with a single primary navigation", () => {
    renderApp({ route: "/" });
    expect(screen.getByRole("heading", { level: 1, name: "Home" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /create your first set/i })).toHaveAttribute("href", "/create");
    expect(screen.getAllByRole("navigation", { name: "Primary" })).toHaveLength(1);
    for (const name of ["Home", "Create", "Library", "Settings"]) expect(nav().getByRole("link", { name })).toBeInTheDocument();
    expect(nav().getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
  });

  it("moves focus to the new page heading after navigating", async () => {
    const user = userEvent.setup();
    renderApp({ route: "/" });
    await user.click(nav().getByRole("link", { name: "Library" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Library" })).toHaveFocus();
  });

  it("lists every way to create, each linking to its own screen", () => {
    renderApp({ route: "/create" });
    const expected = {
      "Scan document": "/create/ai/scan",
      "Select images": "/create/ai/images",
      "Paste text": "/create/ai/text",
      "Select file": "/create/ai/files",
      "Describe a topic": "/create/ai/topic",
      "Create manually": "/create/manual",
    };
    for (const [name, href] of Object.entries(expected)) {
      expect(screen.getByRole("link", { name: new RegExp(name) })).toHaveAttribute("href", href);
    }
  });

  it("tailors each AI source: file types, camera capture, hidden file box for topics", () => {
    const { unmount } = renderApp({ route: "/create/ai/scan" });
    const scan = screen.getByLabelText(/take a photo/i) as HTMLInputElement;
    expect(scan).toHaveAttribute("capture", "environment");
    expect(scan.accept).toBe(".png,.jpg,.jpeg,.webp");
    unmount();

    const files = renderApp({ route: "/create/ai/files" });
    expect((screen.getByLabelText(/choose files/i) as HTMLInputElement).accept).toContain(".pdf");
    expect((screen.getByLabelText(/choose files/i) as HTMLInputElement).accept).not.toContain(".png");
    files.unmount();

    renderApp({ route: "/create/ai/topic" });
    expect(screen.queryByLabelText(/attach|choose/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Your topic")).toBeInTheDocument();
  });

  it("asks to attach something (not to paste notes) on file-first screens", async () => {
    const user = userEvent.setup();
    renderApp({ route: "/create/ai/images" });
    await user.click(screen.getByRole("button", { name: /generate study set/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/attach at least one image/i);
  });

  it("redirects an unknown source to the Create menu, and unknown routes show Not found", () => {
    renderApp({ route: "/create/ai/telepathy" });
    expect(screen.getByRole("heading", { level: 1, name: "Create a study set" })).toBeInTheDocument();
    renderApp({ route: "/nope" });
    expect(screen.getByRole("heading", { name: "Not found" })).toBeInTheDocument();
  });
});

describe("saving generated sets", () => {
  async function generateText(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByLabelText(/your notes or topic/i));
    await user.paste(SAMPLE_NOTES);
    await user.click(screen.getByRole("button", { name: /generate study set/i }));
  }

  it("saves into the chosen folder and opens the set, with a saved notice", async () => {
    const user = userEvent.setup();
    const storage = memoryStorage();
    seedStorage(storage, library({ folders: [folder("bio", "Biology")] }));
    renderApp({ route: "/create/ai/text?folder=bio", generate: ok(), storage });

    expect(screen.getByLabelText("Save to folder")).toHaveValue("bio");
    await generateText(user);

    expect(await screen.findByRole("heading", { level: 1, name: "Photosynthesis" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/saved to your library in “Biology”/i);
    const saved = readLibrary(storage);
    expect(saved.sets).toHaveLength(1);
    expect(saved.sets[0]).toMatchObject({ folderId: "bio", source: "ai", title: "Photosynthesis" });
  });

  it("can create a new folder while generating", async () => {
    const user = userEvent.setup();
    const { storage } = renderApp({ route: "/create/ai/text", generate: ok() });
    await user.selectOptions(screen.getByLabelText("Save to folder"), "+ New folder…");
    await user.type(screen.getByLabelText("New folder name"), "Chemistry");
    await generateText(user);

    await screen.findByRole("heading", { level: 1, name: "Photosynthesis" });
    const saved = readLibrary(storage);
    expect(saved.folders.map((f) => f.name)).toEqual(["Chemistry"]);
    expect(saved.sets[0].folderId).toBe(saved.folders[0].id);
  });

  it("saves exactly once even under StrictMode's double effects", async () => {
    const user = userEvent.setup();
    const { storage } = renderApp({ route: "/create/ai/text", generate: ok(), strict: true });
    await generateText(user);
    await screen.findByRole("heading", { level: 1, name: "Photosynthesis" });
    expect(readLibrary(storage).sets).toHaveLength(1);
  });

  it("never saves a set whose request finishes after the user left the page", async () => {
    const user = userEvent.setup();
    const d = deferred<StudySet>();
    const storage = memoryStorage();
    renderApp({ route: "/create/ai/text", generate: vi.fn(() => d.promise), storage });
    await generateText(user);
    await user.click(nav().getByRole("link", { name: "Library" }));
    await screen.findByRole("heading", { level: 1, name: "Library" });

    d.resolve(makeStudySet({ id: "late" }));
    await new Promise((r) => setTimeout(r, 20));
    expect(readLibrary(storage)?.sets ?? []).toHaveLength(0);
    expect(screen.getByRole("heading", { level: 1, name: "Library" })).toBeInTheDocument();
  });

  it("saves nothing when generation fails, and keeps the form", async () => {
    const user = userEvent.setup();
    const generate = vi.fn().mockRejectedValue(new ApiClientError("AI_TIMEOUT", "Too slow.", true));
    const { storage } = renderApp({ route: "/create/ai/text", generate });
    await generateText(user);
    expect(await screen.findByRole("alert")).toHaveTextContent(/too slow/i);
    expect(screen.getByLabelText(/your notes or topic/i)).toHaveValue(SAMPLE_NOTES);
    expect(readLibrary(storage)?.sets ?? []).toHaveLength(0);
  });
});

describe("Library: browsing sets", () => {
  const lib = () =>
    library({
      folders: [folder("bio", "Biology", "green"), folder("es", "Spanish", "rose"), folder("empty", "Exam prep", "violet")],
      sets: [aiSet("s1", "Cell organelles", "bio"), manualSet("s2", "Spanish verbs", "es"), aiSet("s3", "Zebra facts", null)],
    });

  it("lists sets with their folder, counts and progress", () => {
    seeded(lib(), "/library");
    const list = screen.getByRole("tabpanel", { name: /sets/i });
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    const first = within(list).getByRole("link", { name: /Cell organelles/ });
    expect(first).toHaveAttribute("href", "/sets/s1");
    expect(first).toHaveTextContent("Biology");
    expect(first).toHaveTextContent("3 cards · 3 questions");
    expect(first).toHaveTextContent("Not studied yet");
  });

  it("searches titles and card text, and says when nothing matches", async () => {
    const user = userEvent.setup();
    seeded(lib(), "/library");
    await user.type(screen.getByLabelText("Search sets"), "verbs");
    expect(screen.getByRole("status", { name: "" })).toHaveTextContent("1 set");
    expect(screen.getByRole("link", { name: /Spanish verbs/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Cell organelles/ })).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText("Search sets"));
    await user.type(screen.getByLabelText("Search sets"), "Madrid"); // matches a card, not a title
    expect(screen.getByRole("link", { name: /Spanish verbs/ })).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Search sets"));
    await user.type(screen.getByLabelText("Search sets"), "zzzz");
    expect(screen.getByText(/no sets match/i)).toBeInTheDocument();
  });

  it("filters by folder (including Unsorted) and sorts A to Z", async () => {
    const user = userEvent.setup();
    seeded(lib(), "/library");
    await user.selectOptions(screen.getByLabelText("Filter by folder"), "Unsorted");
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual([expect.stringContaining("Zebra facts")]);

    await user.selectOptions(screen.getByLabelText("Filter by folder"), "All folders");
    await user.selectOptions(screen.getByLabelText("Sort sets"), "A to Z");
    const titles = screen.getAllByRole("link", { name: /organelles|verbs|Zebra/ }).map((a) => a.textContent ?? "");
    expect(titles[0]).toContain("Cell organelles");
    expect(titles[2]).toContain("Zebra facts");
  });

  it("shows a friendly empty state with a Create link", () => {
    renderApp({ route: "/library" });
    expect(screen.getByText(/no study sets yet/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create a set" })).toHaveAttribute("href", "/create");
  });

  it("shows folders with set counts, plus Unsorted", () => {
    seeded(lib(), "/library?tab=folders");
    const panel = screen.getByRole("tabpanel", { name: /folders/i });
    expect(within(panel).getByRole("link", { name: /Biology/ })).toHaveTextContent("1 set");
    expect(within(panel).getByRole("link", { name: /Exam prep/ })).toHaveTextContent("0 sets");
    expect(within(panel).getByRole("link", { name: /Unsorted/ })).toHaveAttribute("href", "/folders/unsorted");
  });
});

describe("Folders", () => {
  it("creates a folder from the Library, validating the name", async () => {
    const user = userEvent.setup();
    const { storage } = renderApp({ route: "/library?tab=folders" });
    await user.click(screen.getByRole("button", { name: "New folder" }));
    const dialog = screen.getByRole("dialog", { name: "New folder" });

    await user.click(within(dialog).getByRole("button", { name: "Create folder" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent(/give the folder a name/i);

    await user.type(within(dialog).getByLabelText("Folder name"), "Biology");
    await user.click(within(dialog).getByLabelText("rose"));
    await user.click(within(dialog).getByRole("button", { name: "Create folder" }));

    expect(readLibrary(storage).folders).toMatchObject([{ name: "Biology", color: "rose" }]);
    expect(await screen.findByRole("link", { name: /Biology/ })).toBeInTheDocument();
  });

  it("renames and recolours from the folder page", async () => {
    const user = userEvent.setup();
    const { storage } = seeded(library({ folders: [folder("bio", "Biology")] }), "/folders/bio");
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const dialog = screen.getByRole("dialog", { name: "Edit folder" });
    const name = within(dialog).getByLabelText("Folder name");
    await user.clear(name);
    await user.type(name, "Life sciences");
    await user.click(within(dialog).getByRole("button", { name: "Save folder" }));
    expect(readLibrary(storage).folders[0].name).toBe("Life sciences");
    expect(await screen.findByRole("heading", { level: 1, name: /Life sciences/ })).toBeInTheDocument();
  });

  const withSets = () => library({ folders: [folder("bio", "Biology")], sets: [aiSet("s1", "Cells", "bio"), aiSet("s2", "Genetics", "bio")] });

  it("deleting a folder keeps its sets by default (moved to Unsorted)", async () => {
    const user = userEvent.setup();
    const { storage } = seeded(withSets(), "/folders/bio");
    await user.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = screen.getByRole("dialog", { name: "Delete this folder?" });
    expect(within(dialog).getByLabelText(/Keep the 2 sets/)).toBeChecked();
    await user.click(within(dialog).getByRole("button", { name: "Delete folder" }));

    const saved = readLibrary(storage);
    expect(saved.folders).toEqual([]);
    expect(saved.sets.map((s) => [s.id, s.folderId])).toEqual([["s1", null], ["s2", null]]);
    expect(await screen.findByRole("heading", { level: 1, name: "Library" })).toBeInTheDocument();
  });

  it("can delete the folder and its sets together, after an explicit choice", async () => {
    const user = userEvent.setup();
    const { storage } = seeded(withSets(), "/folders/bio");
    await user.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = screen.getByRole("dialog", { name: "Delete this folder?" });
    await user.click(within(dialog).getByLabelText(/Delete the 2 sets too/));
    await user.click(within(dialog).getByRole("button", { name: "Delete folder and 2 sets" }));
    expect(readLibrary(storage)).toMatchObject({ folders: [], sets: [] });
  });

  it("Cancel leaves the folder untouched", async () => {
    const user = userEvent.setup();
    const { storage } = seeded(withSets(), "/folders/bio");
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(readLibrary(storage).folders).toHaveLength(1);
  });

  it("shows Unsorted sets, an empty folder state, and Not found for a missing folder", () => {
    seeded(library({ folders: [folder("e", "Empty")], sets: [aiSet("s1", "Loose set")] }), "/folders/unsorted");
    expect(screen.getByRole("link", { name: /Loose set/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument(); // Unsorted can't be deleted

    renderApp({ route: "/folders/ghost" });
    expect(screen.getByRole("heading", { name: "Not found" })).toBeInTheDocument();
  });

  it("'Add a set' inside a folder preselects that folder in the Create flow", async () => {
    const user = userEvent.setup();
    seeded(library({ folders: [folder("bio", "Biology")] }), "/folders/bio");
    expect(screen.getByText("This folder is empty")).toBeInTheDocument();
    const add = screen.getByRole("link", { name: /add a set/i });
    expect(add).toHaveAttribute("href", "/create?folder=bio");
    await user.click(add);
    expect(screen.getByRole("link", { name: /Paste text/ })).toHaveAttribute("href", "/create/ai/text?folder=bio");
  });
});

describe("Set page: studying", () => {
  const setup = () => seeded(library({ sets: [aiSet("s1", "Photosynthesis")] }), "/sets/s1");

  it("stars a card and remembers it", async () => {
    const user = userEvent.setup();
    const { storage } = setup();
    await user.click(screen.getByRole("button", { name: "Star this card" }));
    expect(screen.getByRole("button", { name: "Unstar this card" })).toHaveAttribute("aria-pressed", "true");
    expect(readLibrary(storage).sets[0].flashcards[0].starred).toBe(true);
  });

  it("'I know it' records progress, advances, and updates the summary", async () => {
    const user = userEvent.setup();
    const { storage } = setup();
    expect(screen.getByTestId("known-summary")).toHaveTextContent("0 of 3 known");
    await user.click(screen.getByRole("button", { name: "I know it" }));

    expect(screen.getByTestId("card-progress")).toHaveTextContent("Card 2 of 3");
    expect(screen.getByTestId("known-summary")).toHaveTextContent("1 of 3 known");
    expect(screen.getByText(/progress: 1 of 3 cards known \(33%\)/i)).toBeInTheDocument();
    const saved = readLibrary(storage);
    expect(saved.sets[0].flashcards.map((c) => c.status)).toEqual(["known", "new", "new"]);
    expect(saved.sets[0].lastStudiedAt).toBeTruthy();
    expect(saved.activity).toHaveLength(1);
  });

  it("'Still learning' marks the card without hiding it from 'Not known yet'", async () => {
    const user = userEvent.setup();
    const { storage } = setup();
    await user.selectOptions(screen.getByLabelText("Cards to study"), "Not known yet (3)");
    await user.click(screen.getByRole("button", { name: "Still learning" }));
    expect(readLibrary(storage).sets[0].flashcards[0].status).toBe("learning");
    expect(screen.getByTestId("card-progress")).toHaveTextContent("Card 2 of 3");
  });

  it("marking a card known while in 'Not known yet' does not remove it mid-review", async () => {
    const user = userEvent.setup();
    setup();
    await user.selectOptions(screen.getByLabelText("Cards to study"), "Not known yet (3)");
    await user.click(screen.getByRole("button", { name: "I know it" }));
    // Still a 3-card deck; we moved to the next card instead of the deck shrinking under us.
    expect(screen.getByTestId("card-progress")).toHaveTextContent("Card 2 of 3");
  });

  it("starred filter explains itself when empty, then offers all cards", async () => {
    const user = userEvent.setup();
    setup();
    await user.selectOptions(screen.getByLabelText("Cards to study"), "Starred (0)");
    expect(screen.getByText("No starred cards yet")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show all cards" }));
    expect(screen.getByTestId("card-progress")).toHaveTextContent("Card 1 of 3");
  });

  it("studies only starred cards", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Star this card" })); // star card 2
    await user.selectOptions(screen.getByLabelText("Cards to study"), "Starred (1)");
    expect(screen.getByTestId("card-progress")).toHaveTextContent("Card 1 of 1");
    expect(screen.getByRole("button", { name: "Unstar this card" })).toBeInTheDocument();
  });

  it("shuffle keeps every card and toggles back to the original order", async () => {
    const user = userEvent.setup();
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    setup();
    const first = screen.getByTestId("flashcard").textContent;
    await user.click(screen.getByRole("button", { name: "Shuffle" }));
    expect(screen.getByRole("button", { name: "Shuffle" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("card-progress")).toHaveTextContent("Card 1 of 3");
    expect(screen.getByTestId("flashcard").textContent).not.toBe(first); // Math.random()=0 rotates the deck

    await user.click(screen.getByRole("button", { name: "Shuffle" }));
    expect(screen.getByTestId("flashcard").textContent).toBe(first);
    random.mockRestore();
  });

  it("records the best quiz score when the quiz is finished", async () => {
    const user = userEvent.setup();
    const { storage } = setup();
    await user.click(screen.getByRole("tab", { name: "Quiz" }));
    const panel = screen.getByRole("tabpanel", { name: "Quiz" });
    const answer = async (text: RegExp, last = false) => {
      await user.click(within(panel).getByRole("radio", { name: text }));
      await user.click(within(panel).getByRole("button", { name: "Check answer" }));
      await user.click(within(panel).getByRole("button", { name: last ? "See results" : "Next question" }));
    };
    await answer(/Chloroplast/);
    await answer(/Oxygen/);
    await answer(/Stores glucose/, true); // wrong
    expect(readLibrary(storage).sets[0].quizBest).toEqual({ correct: 2, total: 3 });
    expect(screen.getByText(/best quiz score 2\/3/i)).toBeInTheDocument();
  });

  it("Reset clears progress only after confirming, and keeps stars", async () => {
    const user = userEvent.setup();
    const { storage } = setup();
    await user.click(screen.getByRole("button", { name: "Star this card" }));
    await user.click(screen.getByRole("button", { name: "I know it" }));
    await user.click(screen.getByRole("button", { name: /reset/i }));
    const dialog = screen.getByRole("dialog", { name: "Reset your progress?" });
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(readLibrary(storage).sets[0].flashcards[0].status).toBe("known");

    await user.click(screen.getByRole("button", { name: /reset/i }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Reset progress" }));
    const card = readLibrary(storage).sets[0].flashcards[0];
    expect(card).toMatchObject({ status: "new", starred: true });
  });

  it("shows Not found for a deleted or unknown set", () => {
    renderApp({ route: "/sets/ghost" });
    expect(screen.getByRole("heading", { name: "Not found" })).toBeInTheDocument();
  });
});

describe("Set page: managing", () => {
  it("moves a set to another folder, or to a brand-new one", async () => {
    const user = userEvent.setup();
    const { storage } = seeded(library({ folders: [folder("bio", "Biology")], sets: [aiSet("s1", "Cells")] }), "/sets/s1");
    await user.click(screen.getByRole("button", { name: "Move" }));
    let dialog = screen.getByRole("dialog", { name: "Move to folder" });
    await user.selectOptions(within(dialog).getByLabelText("Folder"), "Biology");
    await user.click(within(dialog).getByRole("button", { name: "Move" }));
    expect(readLibrary(storage).sets[0].folderId).toBe("bio");
    expect(within(screen.getByRole("navigation", { name: "Breadcrumb" })).getByRole("link", { name: "Biology" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Move" }));
    dialog = screen.getByRole("dialog", { name: "Move to folder" });
    await user.selectOptions(within(dialog).getByLabelText("Folder"), "+ New folder…");
    await user.type(within(dialog).getByLabelText("New folder name"), "Revision");
    await user.click(within(dialog).getByRole("button", { name: "Move" }));
    const saved = readLibrary(storage);
    expect(saved.folders.map((f) => f.name)).toEqual(["Biology", "Revision"]);
    expect(saved.sets[0].folderId).toBe(saved.folders[1].id);
  });

  it("duplicates a set into an independent copy and opens it", async () => {
    const user = userEvent.setup();
    const { storage } = seeded(library({ sets: [aiSet("s1", "Cells")] }), "/sets/s1");
    await user.click(screen.getByRole("button", { name: "Duplicate" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Cells (copy)" })).toBeInTheDocument();
    expect(readLibrary(storage).sets.map((s) => s.title).sort()).toEqual(["Cells", "Cells (copy)"]);
  });

  it("deletes only after confirmation, then returns to the folder or library", async () => {
    const user = userEvent.setup();
    const { storage } = seeded(library({ sets: [aiSet("s1", "Cells")] }), "/sets/s1");
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByRole("dialog", { name: "Delete this study set?" })).toHaveTextContent("can't be undone");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(readLibrary(storage).sets).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete set" }));
    expect(readLibrary(storage).sets).toHaveLength(0);
    expect(await screen.findByRole("heading", { level: 1, name: "Library" })).toBeInTheDocument();
  });

  it("adds a quiz to a cards-only set using the AI, sending the card text", async () => {
    const user = userEvent.setup();
    const generate = vi.fn(async () => makeStudySet({ id: "quiz-run", mode: "quiz", flashcards: [] }));
    const storage = memoryStorage();
    seedStorage(storage, library({ sets: [manualSet("m1", "Capitals")] }));
    renderApp({ route: "/sets/m1", generate, storage });

    expect(screen.queryByRole("tab", { name: "Quiz" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /make a quiz from these cards/i }));

    const sent = generate.mock.calls[0] as unknown as [{ notes: string; mode: string }];
    expect(sent[0].mode).toBe("quiz");
    expect(sent[0].notes).toContain("Q: Capital of France?\nA: Paris");
    expect(await screen.findByRole("tab", { name: "Quiz" })).toBeInTheDocument();
    const saved = readLibrary(storage).sets[0];
    expect(saved.quiz).toHaveLength(3);
    expect(saved.mode).toBe("both");
    expect(saved.flashcards).toHaveLength(3); // cards untouched
  });

  it("reports a failed quiz request without changing the set", async () => {
    const user = userEvent.setup();
    const generate = vi.fn().mockRejectedValue(new ApiClientError("AI_TIMEOUT", "Too slow.", true));
    const storage = memoryStorage();
    seedStorage(storage, library({ sets: [manualSet("m1", "Capitals")] }));
    renderApp({ route: "/sets/m1", generate, storage });
    await user.click(screen.getByRole("button", { name: /make a quiz/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/too slow/i);
    expect(readLibrary(storage).sets[0].quiz).toEqual([]);
  });
});

describe("Editor", () => {
  it("creates a manual set without calling the AI", async () => {
    const user = userEvent.setup();
    const generate = ok();
    const storage = memoryStorage();
    renderApp({ route: "/create/manual", generate, storage });

    await user.type(screen.getByLabelText("Title"), "Capitals");
    await user.type(screen.getByLabelText(/question for card 1/i), "Capital of Japan?");
    await user.type(screen.getByLabelText(/answer for card 1/i), "Tokyo");
    await user.click(screen.getByRole("button", { name: "Add card" }));
    expect(screen.getByLabelText(/question for card 4/i)).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Create set" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Capitals" })).toBeInTheDocument();
    expect(generate).not.toHaveBeenCalled();
    const set = readLibrary(storage).sets[0];
    expect(set).toMatchObject({ source: "manual", title: "Capitals", mode: "flashcards", quiz: [] });
    expect(set.flashcards).toHaveLength(1); // blank rows are dropped
    expect(set.flashcards[0]).toMatchObject({ question: "Capital of Japan?", answer: "Tokyo", status: "new" });
  });

  it("lists every problem when saving an incomplete set", async () => {
    const user = userEvent.setup();
    const storage = memoryStorage();
    renderApp({ route: "/create/manual", storage });
    await user.type(screen.getByLabelText(/question for card 1/i), "Half a card");
    await user.click(screen.getByRole("button", { name: "Create set" }));

    const summary = screen.getAllByRole("alert")[0];
    expect(summary).toHaveFocus();
    expect(summary).toHaveTextContent(/fix 2 problems/i);
    expect(summary).toHaveTextContent("Give your set a title.");
    expect(summary).toHaveTextContent(/add both a question and an answer/i);
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("requires at least one complete card", async () => {
    const user = userEvent.setup();
    renderApp({ route: "/create/manual" });
    await user.type(screen.getByLabelText("Title"), "Empty");
    await user.click(screen.getByRole("button", { name: "Create set" }));
    expect(screen.getAllByRole("alert")[0]).toHaveTextContent(/add at least one card/i);
  });

  it("rejects over-long questions", async () => {
    const user = userEvent.setup();
    renderApp({ route: "/create/manual" });
    await user.type(screen.getByLabelText("Title"), "Long");
    await user.click(screen.getByLabelText(/question for card 1/i));
    await user.paste("q".repeat(401));
    await user.type(screen.getByLabelText(/answer for card 1/i), "a");
    await user.click(screen.getByRole("button", { name: "Create set" }));
    expect(screen.getAllByRole("alert")[0]).toHaveTextContent(/question is too long/i);
  });

  it("edits a set while keeping progress on untouched cards", async () => {
    const user = userEvent.setup();
    const base = aiSet("s1", "Photosynthesis");
    base.flashcards[0] = { ...base.flashcards[0], status: "known", starred: true };
    base.flashcards[1] = { ...base.flashcards[1], status: "known" };
    const storage = memoryStorage();
    seedStorage(storage, library({ sets: [base] }));
    renderApp({ route: "/sets/s1/edit", storage });

    await user.clear(screen.getByLabelText("Title"));
    await user.type(screen.getByLabelText("Title"), "Photosynthesis (edited)");
    const answer2 = screen.getByLabelText(/answer for card 2/i);
    await user.clear(answer2);
    await user.type(answer2, "A new answer");
    await user.click(screen.getByRole("button", { name: "Remove card 3" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Photosynthesis (edited)" })).toBeInTheDocument();
    const saved = readLibrary(storage).sets[0];
    expect(saved.flashcards).toHaveLength(2);
    expect(saved.flashcards[0]).toMatchObject({ id: base.flashcards[0].id, status: "known", starred: true }); // untouched
    expect(saved.flashcards[1]).toMatchObject({ id: base.flashcards[1].id, status: "learning", answer: "A new answer" }); // reworded
    expect(saved.quiz).toHaveLength(3); // quiz preserved
  });

  it("imports cards pasted from a spreadsheet or notes, and reports skipped lines", async () => {
    const user = userEvent.setup();
    renderApp({ route: "/create/manual" });
    await user.click(screen.getByRole("button", { name: "Import from text" }));
    const dialog = screen.getByRole("dialog", { name: "Import cards from text" });
    await user.click(within(dialog).getByLabelText("Cards to import"));
    await user.paste("Mitochondria - Makes ATP\nNucleus\tStores DNA\nthis line has no separator");
    await user.click(within(dialog).getByRole("button", { name: "Add cards" }));

    expect(screen.getByLabelText(/question for card 1/i)).toHaveValue("Mitochondria");
    expect(screen.getByLabelText(/answer for card 2/i)).toHaveValue("Stores DNA");
    expect(screen.getByRole("status")).toHaveTextContent(/1 line was skipped/i);
  });

  it("shows Not found when editing a set that doesn't exist", () => {
    renderApp({ route: "/sets/ghost/edit" });
    expect(screen.getByRole("heading", { name: "Not found" })).toBeInTheDocument();
  });
});

describe("Home", () => {
  it("shows streak, counts, recent sets and folders", () => {
    const today = new Date();
    const day = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const known = aiSet("s1", "Cells", "bio");
    known.flashcards = known.flashcards.map((c) => ({ ...c, status: "known" as const }));
    seeded(library({ folders: [folder("bio", "Biology")], sets: [known, manualSet("s2", "Capitals")], activity: [day] }), "/");

    expect(screen.getByText("1 day")).toBeInTheDocument();
    expect(screen.getByText("Study streak")).toBeInTheDocument();
    expect(screen.getByText("Cards known")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Cells/ })).toHaveAttribute("href", "/sets/s1");
    expect(within(screen.getByRole("region", { name: "Your folders" })).getByRole("link", { name: /Biology/ })).toBeInTheDocument();
  });
});

describe("Settings", () => {
  it("changes and remembers the theme", async () => {
    const user = userEvent.setup();
    renderApp({ route: "/settings" });
    await user.click(screen.getByLabelText("Light"));
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("recall-studio:theme")).toBe("light");
    await user.click(screen.getByLabelText("Dark"));
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("imports a valid backup by merging, without losing existing data", async () => {
    const user = userEvent.setup();
    const { storage } = seeded(library({ sets: [aiSet("mine", "My set")] }), "/settings");
    const backup = library({ folders: [folder("f", "Imported folder")], sets: [aiSet("theirs", "Their set", "f")] });
    await user.upload(screen.getByLabelText(/choose backup file/i), new File([JSON.stringify(backup)], "backup.json", { type: "application/json" }));

    expect(await screen.findByRole("status")).toHaveTextContent(/merged/i);
    const saved = readLibrary(storage);
    expect(saved.sets.map((s) => s.title).sort()).toEqual(["My set", "Their set"]);
    expect(saved.folders.map((f) => f.name)).toEqual(["Imported folder"]);
  });

  it("rejects a file that isn't a backup and changes nothing", async () => {
    const user = userEvent.setup();
    const { storage } = seeded(library({ sets: [aiSet("mine", "My set")] }), "/settings");
    await user.upload(screen.getByLabelText(/choose backup file/i), new File(['{"hello":"world"}'], "x.json", { type: "application/json" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/isn't a recall studio backup/i);
    expect(readLibrary(storage).sets).toHaveLength(1);
  });

  it("replacing the library needs a confirmation", async () => {
    const user = userEvent.setup();
    const { storage } = seeded(library({ sets: [aiSet("mine", "My set")] }), "/settings");
    await user.click(screen.getByLabelText("Replace my library"));
    const backup = library({ sets: [aiSet("theirs", "Their set")] });
    await user.upload(screen.getByLabelText(/choose backup file/i), new File([JSON.stringify(backup)], "b.json", { type: "application/json" }));

    const dialog = await screen.findByRole("dialog", { name: "Replace your library?" });
    expect(readLibrary(storage).sets.map((s) => s.title)).toEqual(["My set"]); // not yet
    await user.click(within(dialog).getByRole("button", { name: "Replace everything" }));
    expect(readLibrary(storage).sets.map((s) => s.title)).toEqual(["Their set"]);
  });

  it("deletes all data only after confirming", async () => {
    const user = userEvent.setup();
    const { storage } = seeded(library({ folders: [folder("f", "F")], sets: [aiSet("s", "S")] }), "/settings");
    await user.click(screen.getByRole("button", { name: "Delete all my data" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(readLibrary(storage).sets).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Delete all my data" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete everything" }));
    expect(readLibrary(storage)).toMatchObject({ folders: [], sets: [] });
  });
});

describe("persistence and storage problems", () => {
  it("keeps the library across a reload (remount with the same storage)", async () => {
    const user = userEvent.setup();
    const storage = memoryStorage();
    const first = renderApp({ route: "/create/ai/text", generate: ok(), storage });
    await user.click(screen.getByLabelText(/your notes or topic/i));
    await user.paste(SAMPLE_NOTES);
    await user.click(screen.getByRole("button", { name: /generate study set/i }));
    await screen.findByRole("heading", { level: 1, name: "Photosynthesis" });
    first.unmount();

    renderApp({ route: "/library", storage });
    expect(screen.getByRole("link", { name: /Photosynthesis/ })).toBeInTheDocument();
  });

  it("recovers from unreadable saved data: tells the user and keeps a backup copy", () => {
    const storage = memoryStorage({ [STORAGE_KEY]: "{definitely not json" });
    renderApp({ route: "/library", storage });
    expect(screen.getByRole("alert")).toHaveTextContent(/couldn't be read/i);
    expect(storage.getItem(BACKUP_KEY)).toBe("{definitely not json");
    expect(screen.getByText(/no study sets yet/i)).toBeInTheDocument();
  });

  it("warns when storage is full instead of silently losing work", async () => {
    const user = userEvent.setup();
    const storage = memoryStorage({}, { failWith: "QuotaExceededError" });
    renderApp({ route: "/create/ai/text", generate: ok(), storage });
    await user.click(screen.getByLabelText(/your notes or topic/i));
    await user.paste(SAMPLE_NOTES);
    await user.click(screen.getByRole("button", { name: /generate study set/i }));

    // The set is still usable this session, and the user is told it wasn't saved.
    expect(await screen.findByRole("heading", { level: 1, name: "Photosynthesis" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/storage is full/i));
  });

  it("works (in memory) when storage is blocked, and says so", async () => {
    const user = userEvent.setup();
    renderApp({ route: "/create/manual", storage: null });
    await user.type(screen.getByLabelText("Title"), "Temp");
    await user.type(screen.getByLabelText(/question for card 1/i), "Q");
    await user.type(screen.getByLabelText(/answer for card 1/i), "A");
    await user.click(screen.getByRole("button", { name: "Create set" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Temp" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/blocking storage/i);
  });
});
