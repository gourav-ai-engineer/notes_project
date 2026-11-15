import type { ReactNode } from "react";
import { Dialog } from "./Dialog";
import { primaryButton, secondaryButton } from "./buttons";

interface Props {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  /** Styles the confirm button as destructive. */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const dangerButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-bad px-5 py-2.5 text-base font-semibold text-paper transition-colors hover:opacity-90 motion-reduce:transition-none";

/** Cancel is first in tab order and the dialog's default, so a stray Enter never deletes anything. */
export function ConfirmDialog({ open, title, children, confirmLabel, danger, onConfirm, onCancel }: Props) {
  return (
    <Dialog open={open} title={title} onClose={onCancel}>
      <div className="text-ink-muted">{children}</div>
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <button type="button" autoFocus onClick={onCancel} className={secondaryButton}>
          Cancel
        </button>
        <button type="button" onClick={onConfirm} className={danger ? dangerButton : primaryButton}>
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
