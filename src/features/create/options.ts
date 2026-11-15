import type { ComponentType } from "react";
import { FileUp, Images, Lightbulb, PencilLine, ScanLine, Type } from "lucide-react";

export interface CreateOption {
  to: string;
  label: string;
  hint: string;
  Icon: ComponentType<{ size?: number; "aria-hidden"?: boolean | "true" }>;
}

/** The ways to start a set. Every one but the last uses the AI; the last needs no network at all. */
export const CREATE_OPTIONS: CreateOption[] = [
  { to: "/create/ai/scan", label: "Scan document", hint: "Use your camera", Icon: ScanLine },
  { to: "/create/ai/images", label: "Select images", hint: ".png, .jpg, .webp", Icon: Images },
  { to: "/create/ai/text", label: "Paste text", hint: "Notes or a topic", Icon: Type },
  { to: "/create/ai/files", label: "Select file", hint: ".pdf, .docx, .txt, .md", Icon: FileUp },
  { to: "/create/ai/topic", label: "Describe a topic", hint: "No notes needed", Icon: Lightbulb },
  { to: "/create/manual", label: "Create manually", hint: "Write your own cards", Icon: PencilLine },
];
