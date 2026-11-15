import { useState } from "react";
import { Link } from "react-router";
import { Smartphone } from "lucide-react";
import { ghostButton, primaryButton } from "../ui/buttons";
import { promptInstall, useInstallStatus, type InstallOutcome } from "../../lib/install";

const INSTALL_DISMISSED_KEY = "recall-studio:install-dismissed";

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(INSTALL_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function InstallButton({ onResult }: { onResult?: (outcome: InstallOutcome) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      className={primaryButton}
      onClick={async () => {
        setBusy(true);
        const outcome = await promptInstall();
        setBusy(false);
        onResult?.(outcome);
      }}
    >
      <Smartphone aria-hidden="true" size={18} />
      Install app
    </button>
  );
}

/** Full explanation for Settings. Always shows something useful, whatever the browser can do. */
export function InstallSection({ headingId }: { headingId: string }) {
  const status = useInstallStatus();
  const [outcome, setOutcome] = useState<InstallOutcome | null>(null);

  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <h2 id={headingId} className="font-display text-2xl font-semibold">
        Install the app
      </h2>

      {status === "installed" && (
        <p role="status" className="max-w-prose text-ink-muted">
          Recall Studio is installed on this device. You can open it from your home screen or app list, even without a connection.
        </p>
      )}

      {status === "available" && (
        <>
          <p className="max-w-prose text-ink-muted">Add Recall Studio to your home screen. It opens full-screen like any other app, and your library and flashcards work offline.</p>
          <InstallButton onResult={setOutcome} />
          {outcome === "dismissed" && (
            <p role="status" className="text-sm text-ink-muted">
              No problem. You can install it any time from here.
            </p>
          )}
          {outcome === "unavailable" && (
            <p role="status" className="text-sm text-ink-muted">
              Your browser could not show the install window. Open its menu and choose Install app or Add to Home screen.
            </p>
          )}
        </>
      )}

      {status === "ios" && (
        <p className="max-w-prose text-ink-muted">
          On iPhone and iPad, open this page in <strong>Safari</strong>, tap the <strong>Share</strong> button, then choose <strong>Add to Home Screen</strong>.
        </p>
      )}

      {status === "manual" && (
        <p className="max-w-prose text-ink-muted">
          In Chrome on Android, open the <strong>⋮</strong> menu and choose <strong>Install app</strong> (or <strong>Add to Home screen</strong>). In Samsung Internet, open the menu and choose <strong>Add page to</strong>, then <strong>Home screen</strong>. On a computer, use the install icon in the address bar. If the option is missing, reload the page once and make sure the address starts with https.
        </p>
      )}
    </section>
  );
}

/** One-time nudge on Home. Only appears when installing is possible, and stays away once dismissed. */
export function InstallBanner() {
  const status = useInstallStatus();
  const [dismissed, setDismissed] = useState(readDismissed);
  if (dismissed || (status !== "available" && status !== "ios")) return null;

  function dismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(INSTALL_DISMISSED_KEY, "1");
    } catch {
      // blocked storage: it only stays hidden for this visit
    }
  }

  return (
    <section aria-labelledby="install-banner-heading" className="flex flex-col gap-3 rounded-card border border-accent/40 bg-accent-soft p-4 sm:flex-row sm:items-center">
      <span aria-hidden="true" className="text-accent-ink">
        <Smartphone size={28} />
      </span>
      <div className="min-w-0 flex-1">
        <h2 id="install-banner-heading" className="font-semibold">
          Install Recall Studio
        </h2>
        <p className="text-sm text-ink-muted">Open it like a real app from your home screen, even offline.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {status === "available" ? (
          <InstallButton />
        ) : (
          <Link to="/settings" className={primaryButton}>
            How to install
          </Link>
        )}
        <button type="button" onClick={dismiss} className={ghostButton}>
          Not now
        </button>
      </div>
    </section>
  );
}
