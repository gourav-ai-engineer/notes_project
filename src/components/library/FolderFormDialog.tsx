import { useState } from "react";
import { FOLDER_COLORS, MAX_FOLDER_NAME, type Folder, type FolderColor } from "../../features/library/model";
import { Dialog } from "../ui/Dialog";
import { primaryButton, secondaryButton } from "../ui/buttons";
import { FOLDER_DOT } from "./folderStyles";

interface Props {
  open: boolean;
  /** Present when renaming/recolouring; absent when creating. */
  folder?: Folder;
  onClose: () => void;
  onSubmit: (name: string, color: FolderColor) => void;
}

/** Remounts its form each time it opens, so the fields always start from the folder being edited. */
export function FolderFormDialog({ open, folder, onClose, onSubmit }: Props) {
  return (
    <Dialog open={open} title={folder ? "Edit folder" : "New folder"} onClose={onClose}>
      <FolderForm folder={folder} onClose={onClose} onSubmit={onSubmit} />
    </Dialog>
  );
}

function FolderForm({ folder, onClose, onSubmit }: Omit<Props, "open">) {
  const [name, setName] = useState(folder?.name ?? "");
  const [color, setColor] = useState<FolderColor>(folder?.color ?? "blue");
  const [touched, setTouched] = useState(false);
  const empty = name.trim().length === 0;

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (empty) {
          setTouched(true);
          return;
        }
        onSubmit(name.trim(), color);
        onClose();
      }}
      className="space-y-5"
    >
      <div>
        <label htmlFor="folder-name" className="mb-1.5 block text-base font-semibold">
          Folder name
        </label>
        <input
          id="folder-name"
          type="text"
          value={name}
          maxLength={MAX_FOLDER_NAME}
          autoFocus
          aria-invalid={touched && empty ? true : undefined}
          aria-describedby={touched && empty ? "folder-name-error" : undefined}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Biology, Spanish, Exam prep"
          className="block min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-base text-ink"
        />
        {touched && empty && (
          <p id="folder-name-error" role="alert" className="mt-1.5 text-sm font-medium text-bad">
            Give the folder a name.
          </p>
        )}
      </div>

      <fieldset>
        <legend className="mb-1.5 text-base font-semibold">Colour</legend>
        <div className="flex flex-wrap gap-3">
          {FOLDER_COLORS.map((c) => (
            <label key={c} className="relative">
              <input type="radio" name="folder-color" value={c} checked={color === c} onChange={() => setColor(c)} className="peer sr-only" />
              <span className="sr-only">{c}</span>
              <span
                aria-hidden="true"
                className={`block size-10 cursor-pointer rounded-full border-2 border-transparent ${FOLDER_DOT[c]} peer-checked:border-ink peer-checked:ring-2 peer-checked:ring-surface peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent`}
              />
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onClose} className={secondaryButton}>
          Cancel
        </button>
        <button type="submit" className={primaryButton}>
          {folder ? "Save folder" : "Create folder"}
        </button>
      </div>
    </form>
  );
}
