import { Link } from "react-router";
import { PageTitle } from "../components/layout/PageTitle";
import { secondaryButton } from "../components/ui/buttons";

export function NotFoundPage({ what = "page" }: { what?: string }) {
  return (
    <div>
      <PageTitle subtitle={`That ${what} doesn't exist, or it was deleted from this device.`}>Not found</PageTitle>
      <div className="flex flex-wrap gap-2">
        <Link to="/library" className={secondaryButton}>
          Go to your library
        </Link>
        <Link to="/" className={secondaryButton}>
          Back home
        </Link>
      </div>
    </div>
  );
}
