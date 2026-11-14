import { TriangleAlert } from "lucide-react";
import type { ApiClientError } from "../../lib/api/studyApi";
import { ERROR_TITLES } from "../../lib/errorCopy";
import { primaryButton, secondaryButton } from "../ui/buttons";

interface Props {
  error: ApiClientError;
  onRetry: () => void;
  onDismiss: () => void;
}

/**
 * Recoverable error. The user's notes and chosen mode stay in the form below,
 * so Retry re-sends the same input and Dismiss lets them edit it first.
 */
export function ErrorBanner({ error, onRetry, onDismiss }: Props) {
  return (
    <div role="alert" className="rise-in rounded-card border border-bad/40 bg-bad-soft p-4 sm:p-5">
      <div className="flex gap-3">
        <TriangleAlert aria-hidden="true" size={22} className="mt-0.5 shrink-0 text-bad" />
        <div className="min-w-0">
          <p className="font-display text-lg font-semibold text-bad">{ERROR_TITLES[error.code]}</p>
          <p className="wrap-anywhere mt-1 text-sm text-ink">{error.message}</p>
          {error.requestId && <p className="mt-1 text-xs text-ink-muted">Reference: {error.requestId}</p>}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {error.retryable && (
          <button type="button" onClick={onRetry} className={primaryButton}>
            Try again
          </button>
        )}
        <button type="button" onClick={onDismiss} className={secondaryButton}>
          Edit my notes
        </button>
      </div>
    </div>
  );
}
