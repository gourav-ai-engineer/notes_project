/** Folder choice in a form: "" = Unsorted, a folder id, or NEW_FOLDER (create one from `newName`). */
export const NEW_FOLDER = "__new__";

export function resolveFolderTarget(value: string, newName: string, createFolder: (name: string) => string): string | null {
  if (value === NEW_FOLDER) {
    const name = newName.trim();
    return name ? createFolder(name) : null;
  }
  return value || null;
}
