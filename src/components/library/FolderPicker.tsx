import { useId } from "react";
import { MAX_FOLDER_NAME, type Folder } from "../../features/library/model";
import { NEW_FOLDER } from "../../features/library/folderTarget";

interface Props {
  folders: Folder[];
  /** "" = Unsorted, a folder id, or NEW_FOLDER. */
  value: string;
  newName: string;
  onChange: (value: string) => void;
  onNewNameChange: (name: string) => void;
  label?: string;
  /** Allow creating a folder inline. */
  allowNew?: boolean;
}

export function FolderPicker({ folders, value, newName, onChange, onNewNameChange, label = "Save to folder", allowNew = true }: Props) {
  const id = useId();
  return (
    <div>
      <label htmlFor={`${id}-select`} className="mb-1.5 block text-base font-semibold">
        {label}
      </label>
      <select
        id={`${id}-select`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="block min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-base text-ink"
      >
        <option value="">Unsorted (no folder)</option>
        {folders.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
        {allowNew && <option value={NEW_FOLDER}>+ New folder…</option>}
      </select>
      {value === NEW_FOLDER && (
        <div className="mt-3">
          <label htmlFor={`${id}-new`} className="mb-1.5 block text-sm font-medium">
            New folder name
          </label>
          <input
            id={`${id}-new`}
            type="text"
            value={newName}
            maxLength={MAX_FOLDER_NAME}
            onChange={(e) => onNewNameChange(e.target.value)}
            placeholder="e.g. Biology"
            className="block min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-base text-ink"
          />
        </div>
      )}
    </div>
  );
}
