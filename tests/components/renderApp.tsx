import { StrictMode } from "react";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import App from "../../src/App";
import type { GenerateFn } from "../../src/lib/api/studyApi";
import { memoryStorage } from "../fixtures/storage";

interface Options {
  route?: string;
  generate?: GenerateFn;
  /** Pass a shared store to test persistence across renders. `null` simulates blocked storage. */
  storage?: Storage | null;
  strict?: boolean;
}

/** Renders the whole app at a route with an in-memory library, so tests never touch real localStorage. */
export function renderApp({ route = "/create/ai/text", generate, storage = memoryStorage(), strict = false }: Options = {}) {
  const tree = (
    <MemoryRouter initialEntries={[route]}>
      <App generate={generate} storage={storage} />
    </MemoryRouter>
  );
  const utils = render(strict ? <StrictMode>{tree}</StrictMode> : tree);
  // Tests that pass `null` (blocked storage) never read this back.
  return { ...utils, storage: storage as Storage };
}
