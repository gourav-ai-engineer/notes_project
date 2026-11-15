import { useId, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { BookOpen, Folder as FolderIcon, FolderPlus, Plus, Search } from "lucide-react";
import { FOLDER_ICON } from "../components/library/folderStyles";
import { FolderFormDialog } from "../components/library/FolderFormDialog";
import { SetCard } from "../components/library/SetCard";
import { PageTitle } from "../components/layout/PageTitle";
import { EmptyState } from "../components/states/EmptyState";
import { Tabs, type TabDef } from "../components/ui/Tabs";
import { tabPanelProps } from "../components/ui/tabIds";
import { primaryButton, secondaryButton } from "../components/ui/buttons";
import { findFolder, setsInFolder, useLibrary } from "../features/library/LibraryContext";
import { cardProgress } from "../features/library/model";
import { plural } from "../lib/format";

type TabId = "sets" | "folders";
type Sort = "recent" | "name" | "progress";

export function LibraryPage() {
  const prefix = useId();
  const lib = useLibrary();
  const [params, setParams] = useSearchParams();
  const tab: TabId = params.get("tab") === "folders" ? "folders" : "sets";
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("recent");
  const [folderFilter, setFolderFilter] = useState("all");
  const [creating, setCreating] = useState(false);

  const { sets, folders } = lib.library;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = sets.filter((s) => {
      if (folderFilter === "unsorted" ? s.folderId !== null : folderFilter !== "all" && s.folderId !== folderFilter) return false;
      return !q || s.title.toLowerCase().includes(q) || s.summary.toLowerCase().includes(q) || s.flashcards.some((c) => c.question.toLowerCase().includes(q) || c.answer.toLowerCase().includes(q));
    });
    const by: Record<Sort, (a: (typeof sets)[number], b: (typeof sets)[number]) => number> = {
      recent: (a, b) => (b.lastStudiedAt ?? b.updatedAt).localeCompare(a.lastStudiedAt ?? a.updatedAt),
      name: (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
      progress: (a, b) => cardProgress(b.flashcards).percent - cardProgress(a.flashcards).percent,
    };
    return [...filtered].sort(by[sort]);
  }, [sets, query, sort, folderFilter]);

  const tabs: TabDef<TabId>[] = [
    { id: "sets", label: `Sets (${sets.length})` },
    { id: "folders", label: `Folders (${folders.length})` },
  ];
  const unsortedCount = setsInFolder(lib.library, null).length;

  return (
    <div>
      <PageTitle
        actions={
          <>
            <button type="button" onClick={() => setCreating(true)} className={secondaryButton}>
              <FolderPlus aria-hidden="true" size={18} />
              New folder
            </button>
            <Link to="/create" className={primaryButton}>
              <Plus aria-hidden="true" size={18} />
              New set
            </Link>
          </>
        }
      >
        Library
      </PageTitle>

      <Tabs tabs={tabs} active={tab} onChange={(id) => setParams(id === "folders" ? { tab: "folders" } : {}, { replace: true })} label="Library sections" idPrefix={prefix} />

      <div className="mt-5" {...tabPanelProps(prefix, "sets")} hidden={tab !== "sets"}>
        {sets.length === 0 ? (
          <EmptyState
            icon={<BookOpen size={36} />}
            title="No study sets yet"
            action={
              <Link to="/create" className={primaryButton}>
                Create a set
              </Link>
            }
          >
            Take the first step towards better marks. Create a set from your notes, files or photos.
          </EmptyState>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
              <div className="relative">
                <label htmlFor={`${prefix}-search`} className="sr-only">
                  Search sets
                </label>
                <Search aria-hidden="true" size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
                <input
                  id={`${prefix}-search`}
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search sets and cards"
                  className="block min-h-11 w-full rounded-xl border border-line-strong bg-surface pl-10 pr-3 text-base text-ink"
                />
              </div>
              <div>
                <label htmlFor={`${prefix}-folder`} className="sr-only">
                  Filter by folder
                </label>
                <select id={`${prefix}-folder`} value={folderFilter} onChange={(e) => setFolderFilter(e.target.value)} className="min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-base text-ink">
                  <option value="all">All folders</option>
                  <option value="unsorted">Unsorted</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={`${prefix}-sort`} className="sr-only">
                  Sort sets
                </label>
                <select id={`${prefix}-sort`} value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-base text-ink">
                  <option value="recent">Recent</option>
                  <option value="name">A to Z</option>
                  <option value="progress">Most known</option>
                </select>
              </div>
            </div>

            <p className="text-sm text-ink-muted" role="status">
              {plural(visible.length, "set")}
            </p>
            {visible.length === 0 ? (
              <p className="rounded-card border border-dashed border-line-strong p-6 text-center text-ink-muted">No sets match your search.</p>
            ) : (
              <ul className="space-y-3">
                {visible.map((s) => (
                  <li key={s.id}>
                    <SetCard set={s} folder={findFolder(lib.library, s.folderId ?? undefined)} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="mt-5" {...tabPanelProps(prefix, "folders")} hidden={tab !== "folders"}>
        {folders.length === 0 && unsortedCount === 0 ? (
          <EmptyState
            icon={<FolderIcon size={36} />}
            title="No folders yet"
            action={
              <button type="button" onClick={() => setCreating(true)} className={primaryButton}>
                Create a folder
              </button>
            }
          >
            Make a folder for each subject, like Biology or Spanish, then save sets into it.
          </EmptyState>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {folders.map((f) => (
              <li key={f.id}>
                <Link to={`/folders/${f.id}`} className="flex items-center gap-3 rounded-card border border-line bg-surface p-4 shadow-card transition-colors hover:bg-accent-soft/40 motion-reduce:transition-none">
                  <FolderIcon aria-hidden="true" size={28} className={`shrink-0 ${FOLDER_ICON[f.color]}`} />
                  <span className="min-w-0">
                    <span className="wrap-anywhere block font-semibold">{f.name}</span>
                    <span className="block text-sm text-ink-muted">{plural(setsInFolder(lib.library, f.id).length, "set")}</span>
                  </span>
                </Link>
              </li>
            ))}
            {unsortedCount > 0 && (
              <li>
                <Link to="/folders/unsorted" className="flex items-center gap-3 rounded-card border border-dashed border-line-strong p-4 transition-colors hover:bg-accent-soft/40 motion-reduce:transition-none">
                  <FolderIcon aria-hidden="true" size={28} className="shrink-0 text-ink-muted" />
                  <span>
                    <span className="block font-semibold">Unsorted</span>
                    <span className="block text-sm text-ink-muted">{plural(unsortedCount, "set")}</span>
                  </span>
                </Link>
              </li>
            )}
          </ul>
        )}
      </div>

      <FolderFormDialog open={creating} onClose={() => setCreating(false)} onSubmit={(name, color) => lib.createFolder(name, color)} />
    </div>
  );
}
