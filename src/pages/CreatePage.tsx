import { Link, useSearchParams } from "react-router";
import { PageTitle } from "../components/layout/PageTitle";
import { CREATE_OPTIONS } from "../features/create/options";

/** The "Create" menu. */
export function CreatePage() {
  const [params] = useSearchParams();
  const folder = params.get("folder");
  const suffix = folder ? `?folder=${encodeURIComponent(folder)}` : "";

  return (
    <div>
      <PageTitle subtitle="Choose how you want to start. Anything you create is saved to your library on this device.">Create a study set</PageTitle>
      <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
        {CREATE_OPTIONS.map(({ to, label, hint, Icon }) => (
          <li key={to}>
            <Link
              to={`${to}${suffix}`}
              className="flex h-full min-h-36 flex-col items-center justify-center gap-3 rounded-card border border-line-strong bg-surface p-4 text-center shadow-card transition-colors hover:bg-accent-soft motion-reduce:transition-none"
            >
              <span className="text-accent-ink">
                <Icon size={32} aria-hidden="true" />
              </span>
              <span className="font-semibold">{label}</span>
              <span className="wrap-anywhere text-sm text-ink-muted">{hint}</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-sm text-ink-muted">
        AI options send what you provide to Google's Gemini API to write your study set. Don't include personal or sensitive information.
      </p>
    </div>
  );
}
