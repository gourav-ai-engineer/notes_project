import { useEffect, useRef, type ReactNode } from "react";

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Native modal <dialog>: focus is trapped, Escape closes it, and focus returns to the opener.
 * Kept mounted-but-closed so showModal()/close() own the open state.
 */
export function Dialog({ open, title, onClose, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onClose={onClose}
      onClick={(e) => {
        // Click on the backdrop (the dialog element itself, outside its content box) closes it.
        if (e.target === ref.current) onClose();
      }}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-card border border-line-strong bg-surface p-0 text-ink shadow-card backdrop:bg-black/60"
    >
      {open && (
        <div className="p-5 sm:p-6">
          <h2 className="wrap-anywhere font-display text-2xl font-semibold">{title}</h2>
          <div className="mt-4">{children}</div>
        </div>
      )}
    </dialog>
  );
}
