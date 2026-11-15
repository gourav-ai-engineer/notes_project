import type { FolderColor } from "../../features/library/model";

/** Literal class names so Tailwind can see them. */
export const FOLDER_DOT: Record<FolderColor, string> = {
  blue: "bg-folder-blue",
  violet: "bg-folder-violet",
  teal: "bg-folder-teal",
  green: "bg-folder-green",
  amber: "bg-folder-amber",
  rose: "bg-folder-rose",
};

export const FOLDER_ICON: Record<FolderColor, string> = {
  blue: "text-folder-blue",
  violet: "text-folder-violet",
  teal: "text-folder-teal",
  green: "text-folder-green",
  amber: "text-folder-amber",
  rose: "text-folder-rose",
};
