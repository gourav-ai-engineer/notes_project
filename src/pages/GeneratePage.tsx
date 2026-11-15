import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router";
import { FolderPicker } from "../components/library/FolderPicker";
import { PageTitle } from "../components/layout/PageTitle";
import { InputPanel } from "../components/input/InputPanel";
import { ErrorBanner } from "../components/states/ErrorBanner";
import { LoadingState } from "../components/states/LoadingState";
import type { StudyMode } from "../../shared/contract";
import { isGenerateSource, SOURCE_CONFIG, type GenerateSource } from "../features/create/sources";
import { resolveFolderTarget } from "../features/library/folderTarget";
import { useLibrary } from "../features/library/LibraryContext";
import { useStudyGenerator } from "../hooks/useStudyGenerator";
import type { GenerateFn } from "../lib/api/studyApi";

interface Props {
  /** Injectable so tests can control timing and failures without a network. */
  generate?: GenerateFn;
}

/**
 * Notes/files + mode live here, above the generator, so a failed request never loses them.
 * On success the set is saved to the library (once) and we move to its page.
 */
export function GeneratePage({ generate }: Props) {
  const { source } = useParams();
  const [params] = useSearchParams();

  if (!isGenerateSource(source)) return <Navigate to="/create" replace />;
  // `key` resets the form when moving between sources, so a file chosen for "images" can't leak into "topic".
  return <GenerateForm key={source} source={source} initialFolder={params.get("folder") ?? ""} generate={generate} />;
}

function GenerateForm({ source, initialFolder, generate }: { source: GenerateSource; initialFolder: string; generate?: GenerateFn }) {
  const cfg = SOURCE_CONFIG[source];
  const navigate = useNavigate();
  const lib = useLibrary();
  const [notes, setNotes] = useState("");
  const [mode, setMode] = useState<StudyMode>("both");
  const [files, setFiles] = useState<File[]>([]);
  const knownFolder = lib.library.folders.some((f) => f.id === initialFolder);
  const [folderTarget, setFolderTarget] = useState(knownFolder ? initialFolder : "");
  const [newFolderName, setNewFolderName] = useState("");
  const { state, run, cancel } = useStudyGenerator(generate);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [refocusInput, setRefocusInput] = useState(0);
  const saved = useRef<string | null>(null);

  // After Cancel / Dismiss, the view that had focus is gone; put focus back in the notes field.
  useEffect(() => {
    if (refocusInput > 0) inputRef.current?.focus();
  }, [refocusInput]);

  // Save exactly once per generated set (the ref survives StrictMode's double effect), then open it.
  const { saveGeneratedSet, createFolder } = lib;
  useEffect(() => {
    if (state.status !== "success" || saved.current === state.studySet.id) return;
    saved.current = state.studySet.id;
    const folderId = resolveFolderTarget(folderTarget, newFolderName, (name) => createFolder(name));
    const id = saveGeneratedSet(state.studySet, folderId);
    navigate(`/sets/${id}`, { replace: true, state: { saved: true } });
  }, [state, folderTarget, newFolderName, saveGeneratedSet, createFolder, navigate]);

  function backToInput(fn: () => void) {
    fn();
    setRefocusInput((n) => n + 1);
  }

  function submit() {
    void run({ notes: notes.trim(), mode, ...(files.length ? { files } : {}) });
  }

  return (
    <div className="space-y-6">
      {state.status !== "loading" && <PageTitle subtitle={cfg.blurb}>{cfg.title}</PageTitle>}

      {state.status === "error" && <ErrorBanner error={state.error} onRetry={submit} onDismiss={() => backToInput(cancel)} />}

      {state.status === "loading" || state.status === "success" ? (
        <LoadingState onCancel={() => backToInput(cancel)} />
      ) : (
        <InputPanel
          source={source}
          notes={notes}
          mode={mode}
          files={files}
          onNotesChange={setNotes}
          onModeChange={setMode}
          onFilesChange={setFiles}
          onSubmit={submit}
          textareaRef={inputRef}
          extra={
            <FolderPicker
              folders={lib.library.folders}
              value={folderTarget}
              newName={newFolderName}
              onChange={setFolderTarget}
              onNewNameChange={setNewFolderName}
            />
          }
        />
      )}
    </div>
  );
}
