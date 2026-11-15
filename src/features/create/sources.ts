import { ACCEPT_ATTRIBUTE } from "../../../shared/contract";

export const GENERATE_SOURCES = ["text", "topic", "files", "images", "scan"] as const;
export type GenerateSource = (typeof GENERATE_SOURCES)[number];

export const isGenerateSource = (v: string | undefined): v is GenerateSource => (GENERATE_SOURCES as readonly string[]).includes(v ?? "");

export interface SourceConfig {
  /** Page heading. */
  title: string;
  blurb: string;
  /** Value for the file input's `accept`. */
  accept: string;
  /** Opens the camera on phones when set. */
  capture?: "environment";
  showFiles: boolean;
  /** Files are the main input; the text box becomes an optional "focus" field. */
  filesFirst: boolean;
  notesLabel: string;
  notesHelp: string;
  attachLabel: string;
  filesHelp: string;
  showExamples: boolean;
}

const IMAGE_ACCEPT = ".png,.jpg,.jpeg,.webp";

export const SOURCE_CONFIG: Record<GenerateSource, SourceConfig> = {
  text: {
    title: "Paste text",
    blurb: "Paste your notes or name a topic, or attach PDFs, documents and photos of your notes.",
    accept: ACCEPT_ATTRIBUTE,
    showFiles: true,
    filesFirst: false,
    notesLabel: "Your notes or topic",
    notesHelp: "Paste lecture notes, a textbook excerpt, or just describe a topic. No formatting needed.",
    attachLabel: "Attach files",
    filesHelp: "Or attach files: PDFs, Word documents, photos or scans of notes, and text files. Drop them here or browse.",
    showExamples: true,
  },
  topic: {
    title: "Describe a topic",
    blurb: "Tell us what you want to learn and we'll write a study set from well-established knowledge.",
    accept: ACCEPT_ATTRIBUTE,
    showFiles: false,
    filesFirst: false,
    notesLabel: "Your topic",
    notesHelp: "Describe the topic in a sentence or two, for example the subject, level and what to focus on.",
    attachLabel: "Attach files",
    filesHelp: "",
    showExamples: true,
  },
  files: {
    title: "Select a file",
    blurb: "Upload a PDF, Word document or text file and we'll build flashcards and a quiz from it.",
    accept: ".pdf,.docx,.doc,.txt,.md",
    showFiles: true,
    filesFirst: true,
    notesLabel: "Focus (optional)",
    notesHelp: "Optional: say what to focus on, for example which chapter matters most.",
    attachLabel: "Choose files",
    filesHelp: "PDF, DOCX, DOC, TXT or Markdown. Drop them here or browse.",
    showExamples: false,
  },
  images: {
    title: "Select images",
    blurb: "Upload photos or screenshots of notes, slides or textbook pages. Handwriting works too.",
    accept: IMAGE_ACCEPT,
    showFiles: true,
    filesFirst: true,
    notesLabel: "Focus (optional)",
    notesHelp: "Optional: say what to focus on.",
    attachLabel: "Choose images",
    filesHelp: "PNG, JPG or WEBP. Drop them here or browse.",
    showExamples: false,
  },
  scan: {
    title: "Scan a document",
    blurb: "Take a photo of a page with your camera. On a computer this opens a file picker instead.",
    accept: IMAGE_ACCEPT,
    capture: "environment",
    showFiles: true,
    filesFirst: true,
    notesLabel: "Focus (optional)",
    notesHelp: "Optional: say what to focus on.",
    attachLabel: "Take a photo",
    filesHelp: "Take one photo per page, then add more. Good light and a flat page read best.",
    showExamples: false,
  },
};
