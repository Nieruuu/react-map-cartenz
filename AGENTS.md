# Repository Guidelines

## Project Structure & Module Organization
- `src/` holds all runtime code. Feature containers live in `components/`, shared state hooks in `hooks/`, design tokens and layout rules in `styles/ui.css`, and shared definitions in `types/`.
- `public/` exposes static assets and the root `index.html`; reference URLs here instead of bundling large files into the app.
- Built artifacts land in `dist/` after `npm run build`. Never commit this directory. Keep temporary data out of version control by using `.env` and `.gitignore`.

## Build, Test, and Development Commands
- `npm install` pulls pinned dependencies from `package-lock.json`.
- `npm run dev` starts the Vite dev server with HMR; default port is 5173. Keep a browser tab open to catch regressions quickly.
- `npm run build` runs `tsc -b` and `vite build` for a production bundle; confirm it before tagging releases.
- `npm run lint` executes ESLint with the shared TypeScript + React config. Fix issues or annotate with a brief `// eslint-disable-next-line` comment and justification.
- `npm run preview` serves the compiled bundle locally for smoke testing.

## Coding Style & Naming Conventions
- TypeScript is mandatory for new modules; prefer functional React components with hooks.
- Use PascalCase for component files (e.g., `FocusCard.tsx`), camelCase for hooks and utilities, and SCSS-style dashed class names inside `ui.css`.
- The ESLint config (ES2020, React Hooks, Refresh) is the source of truth. Keep imports ordered by module depth, and favor early returns over deeply nested conditionals.

## Testing Guidelines
- No automated test harness is configured yet. When adding one, default to Vitest + React Testing Library under `src/__tests__/`.
- Until then, document manual QA steps in your PR description: include the dataset used, viewport tested, and any map interactions exercised.
- Target at least one regression checklist item per UI change (e.g., “layer toggling still redraws tiles”).

## Commit & Pull Request Guidelines
- Use concise Conventional Commit subjects (`feat:`, `fix:`, `chore:`). Group related file edits into a single commit.
- PRs must include: purpose summary, screenshots or screen recordings for UI work, reproduction steps for bug fixes, and links to tracking issues (e.g., “Closes TAX-42”).
- Request review from a domain maintainer for changes touching `useMapStore.ts` or `TaxMap.tsx`, as they coordinate shared state and OpenLayers integration.
