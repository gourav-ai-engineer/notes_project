// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LIMITS } from "../../shared/contract";
import { renderApp } from "./renderApp";
import { ApiClientError, type GenerateFn } from "../../src/lib/api/studyApi";
import { makeStudySet } from "../fixtures/study";

const pdf = (name = "lecture.pdf", size = 2048) => new File([new Uint8Array(size)], name, { type: "application/pdf" });

// applyAccept:false so we can also test files the picker's `accept` filter would normally hide (drag-and-drop).
function setup(generate: GenerateFn = vi.fn(async () => makeStudySet())) {
  const user = userEvent.setup({ applyAccept: false });
  renderApp({ generate: generate });
  return { user, generate, input: () => screen.getByLabelText(/attach files/i) as HTMLInputElement };
}

describe("file attachments in the input form", () => {
  it("offers a labelled file picker that accepts the supported types", () => {
    const { input } = setup();
    expect(input()).toHaveAttribute("type", "file");
    expect(input()).toHaveAttribute("multiple");
    expect(input().accept).toContain(".pdf");
    expect(input().accept).toContain(".docx");
    expect(input().accept).toContain(".png");
  });

  it("lists attached files, announces them, and lets you remove one", async () => {
    const { user, input } = setup();
    await user.upload(input(), [pdf("a.pdf"), pdf("b.pdf")]);

    const list = screen.getByRole("list", { name: /attached files/i });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("status", { hidden: true })).toHaveTextContent(/2 files added/i);

    await user.click(screen.getByRole("button", { name: "Remove a.pdf" }));
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    expect(within(list).queryByText(/a\.pdf/)).not.toBeInTheDocument();
    expect(within(list).getByText(/b\.pdf/)).toBeInTheDocument();
    expect(screen.getByRole("status", { hidden: true })).toHaveTextContent(/removed a\.pdf/i);
  });

  it("lets you generate from files alone and sends them with the request", async () => {
    const { user, input, generate } = setup();
    // No notes typed: without files this would be rejected.
    await user.upload(input(), pdf("lecture.pdf"));
    await user.click(screen.getByRole("button", { name: /generate study set/i }));

    expect(generate).toHaveBeenCalledTimes(1);
    const sent = (generate as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(sent.notes).toBe("");
    expect(sent.files).toHaveLength(1);
    expect(sent.files[0].name).toBe("lecture.pdf");
    expect(await screen.findByRole("heading", { name: "Photosynthesis" })).toBeInTheDocument();
  });

  it("still blocks an empty submission when nothing is attached", async () => {
    const { user, generate } = setup();
    await user.click(screen.getByRole("button", { name: /generate study set/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/paste some notes/i);
    expect(generate).not.toHaveBeenCalled();
  });

  it("rejects an unsupported file type with a clear message and keeps existing files", async () => {
    const { user, input } = setup();
    await user.upload(input(), pdf("ok.pdf"));
    await user.upload(input(), new File(["x"], "setup.exe", { type: "application/x-msdownload" }));
    expect(screen.getByText(/isn't a supported file type/i)).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: /attached files/i })).getAllByRole("listitem")).toHaveLength(1);
  });

  it("rejects an oversized file and an over-count selection", async () => {
    const { user, input } = setup();
    await user.upload(input(), pdf("huge.pdf", LIMITS.maxFileBytes + 1));
    expect(screen.getByText(/larger than 10 MB/i)).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: /attached files/i })).not.toBeInTheDocument();

    await user.upload(input(), Array.from({ length: LIMITS.maxFiles + 1 }, (_, i) => pdf(`f${i}.pdf`, 10 + i)));
    expect(screen.getByText(/at most 5 files/i)).toBeInTheDocument();
  });

  it("wraps very long file names so the page cannot overflow", async () => {
    const { user, input } = setup();
    await user.upload(input(), pdf(`${"x".repeat(150)}.pdf`));
    const item = within(screen.getByRole("list", { name: /attached files/i })).getByRole("listitem");
    expect(item.querySelector(".wrap-anywhere")).not.toBeNull();
  });

  it("keeps the files when a request fails and sends them again on Retry", async () => {
    const generate = vi
      .fn<GenerateFn>()
      .mockRejectedValueOnce(new ApiClientError("AI_TIMEOUT", "The AI took too long to respond. Please try again.", true))
      .mockResolvedValueOnce(makeStudySet());
    const { user, input } = setup(generate);

    await user.upload(input(), pdf("keep-me.pdf"));
    await user.click(screen.getByRole("button", { name: /generate study set/i }));
    await user.click(await screen.findByRole("button", { name: /try again/i }));

    expect(await screen.findByRole("heading", { name: "Photosynthesis" })).toBeInTheDocument();
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1][0].files?.map((f) => f.name)).toEqual(["keep-me.pdf"]);
  });

  it("shows the typed file error without a Retry button", async () => {
    const generate = vi.fn<GenerateFn>().mockRejectedValue(new ApiClientError("FILE_UNREADABLE", "A file couldn't be read.", false));
    const { user, input } = setup(generate);
    await user.upload(input(), pdf("bad.pdf"));
    await user.click(screen.getByRole("button", { name: /generate study set/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("A file couldn't be read");
    expect(screen.queryByRole("button", { name: /try again/i })).not.toBeInTheDocument();
    // The file is still attached so it can be removed or replaced.
    expect(screen.getByRole("button", { name: "Remove bad.pdf" })).toBeInTheDocument();
  });
});
