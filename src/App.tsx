import { Route, Routes } from "react-router";
import { AppShell } from "./components/layout/AppShell";
import { LibraryProvider } from "./features/library/LibraryProvider";
import type { GenerateFn } from "./lib/api/studyApi";
import { CreatePage } from "./pages/CreatePage";
import { EditorPage } from "./pages/EditorPage";
import { FolderPage } from "./pages/FolderPage";
import { GeneratePage } from "./pages/GeneratePage";
import { HomePage } from "./pages/HomePage";
import { LibraryPage } from "./pages/LibraryPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { SetPage } from "./pages/SetPage";
import { SettingsPage } from "./pages/SettingsPage";

interface Props {
  /** Injectable so tests can control timing and failures without a network. */
  generate?: GenerateFn;
  /** Injectable so tests can use an in-memory store. Defaults to localStorage. */
  storage?: Storage | null;
}

/** Routes only: the Router is supplied by main.tsx (BrowserRouter) or by tests (MemoryRouter). */
export default function App({ generate, storage }: Props) {
  return (
    <LibraryProvider storage={storage}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route path="create" element={<CreatePage />} />
          <Route path="create/ai/:source" element={<GeneratePage generate={generate} />} />
          <Route path="create/manual" element={<EditorPage />} />
          <Route path="library" element={<LibraryPage />} />
          <Route path="folders/:folderId" element={<FolderPage />} />
          <Route path="sets/:setId" element={<SetPage generate={generate} />} />
          <Route path="sets/:setId/edit" element={<EditorPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </LibraryProvider>
  );
}
