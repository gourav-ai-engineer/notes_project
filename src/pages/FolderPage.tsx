import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ChevronRight, Folder as FolderIcon, Pencil, Plus, Trash2 } from "lucide-react";
import { FOLDER_ICON } from "../components/library/folderStyles";
import { FolderFormDialog } from "../components/library/FolderFormDialog";
import { SetCard } from "../components/library/SetCard";
import { PageTitle } from "../components/layout/PageTitle";
import { EmptyState } from "../components/states/EmptyState";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { primaryButton, secondaryButton } from "../components/ui/buttons";
import { findFolder, setsInFolder, useLibrary } from "../features/library/LibraryContext";
import { plural } from "../lib/format";
import { NotFoundPage } from "./NotFoundPage";

const UNSORTED = "unsorted";

export function FolderPage() {
  const { folderId } = useParams();
  const navigate = useNavigate();
  const lib = useLibrary();
  const isUnsorted = folderId === UNSORTED;
  const folder = isUnsorted ? undefined : findFolder(lib.library, folderId);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteSets, setDeleteSets] = useState(false);

  if (!isUnsorted && !folder) return <NotFoundPage what="folder" />;

  const sets = setsInFolder(lib.library, isUnsorted ? null : folder!.id);
  const name = isUnsorted ? "Unsorted" : folder!.name;

  return (
    <div className="space-y-2">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-ink-muted">
        <Link to="/library?tab=folders" className="underline-offset-2 hover:underline">
          Library
        </Link>
        <ChevronRight aria-hidden="true" size={14} />
        <span aria-current="page">{name}</span>
      </nav>

      <PageTitle
        subtitle={plural(sets.length, "set")}
        actions={
          <>
            <Link to={isUnsorted ? "/create" : `/create?folder=${encodeURIComponent(folder!.id)}`} className={primaryButton}>
              <Plus aria-hidden="true" size={18} />
              Add a set
            </Link>
            {!isUnsorted && (
              <>
                <button type="button" onClick={() => setEditing(true)} className={secondaryButton}>
                  <Pencil aria-hidden="true" size={18} />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteSets(false);
                    setDeleting(true);
                  }}
                  className={secondaryButton}
                >
                  <Trash2 aria-hidden="true" size={18} />
                  Delete
                </button>
              </>
            )}
          </>
        }
      >
        <span className="inline-flex items-center gap-3">
          <FolderIcon aria-hidden="true" size={32} className={`shrink-0 ${isUnsorted ? "text-ink-muted" : FOLDER_ICON[folder!.color]}`} />
          {name}
        </span>
      </PageTitle>

      {sets.length === 0 ? (
        <EmptyState icon={<FolderIcon size={36} />} title="This folder is empty">
          Add a set to start filling it, or move an existing set here from its page.
        </EmptyState>
      ) : (
        <ul className="space-y-3 pt-2">
          {sets.map((s) => (
            <li key={s.id}>
              <SetCard set={s} />
            </li>
          ))}
        </ul>
      )}

      {folder && (
        <>
          <FolderFormDialog open={editing} folder={folder} onClose={() => setEditing(false)} onSubmit={(n, color) => lib.updateFolder(folder.id, { name: n, color })} />

          <ConfirmDialog
            open={deleting}
            title="Delete this folder?"
            confirmLabel={deleteSets && sets.length > 0 ? `Delete folder and ${plural(sets.length, "set")}` : "Delete folder"}
            danger
            onCancel={() => setDeleting(false)}
            onConfirm={() => {
              lib.deleteFolder(folder.id, deleteSets);
              navigate("/library?tab=folders", { replace: true });
            }}
          >
            <p className="wrap-anywhere">“{folder.name}” will be removed.</p>
            {sets.length > 0 && (
              <fieldset className="mt-4 space-y-2">
                <legend className="sr-only">What happens to the sets inside?</legend>
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3">
                  <input type="radio" name="folder-delete" checked={!deleteSets} onChange={() => setDeleteSets(false)} className="mt-1" />
                  <span>
                    <span className="block font-medium text-ink">Keep the {plural(sets.length, "set")}</span>
                    <span className="block text-sm">They move to Unsorted.</span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3">
                  <input type="radio" name="folder-delete" checked={deleteSets} onChange={() => setDeleteSets(true)} className="mt-1" />
                  <span>
                    <span className="block font-medium text-ink">Delete the {plural(sets.length, "set")} too</span>
                    <span className="block text-sm">This can't be undone.</span>
                  </span>
                </label>
              </fieldset>
            )}
          </ConfirmDialog>
        </>
      )}
    </div>
  );
}
