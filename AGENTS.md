# AGENTS Instructions

## Repository Overview
- This project is a combined Express + MongoDB backend (ES modules) with a Vite-powered React 19 frontend located in `frontend/`.
- Back-end logic lives under `server.js`, `routes/`, `models/`, and `utils/`; shared middleware is under `middleware/`.
- Front-end views and state live in `frontend/src`, organized by feature folders (`pages/`, `components/`, `contexts/`, `api/`). Styling is handled with standard CSS files plus Tailwind utility classes where convenient.
- Authentication is handled through JWTs injected by `middleware/auth.js` and consumed in the browser via `AuthContext` + the shared `axiosInstance`.

## Tooling & Commands
- Install dependencies at the repo root (`npm install`) and within the frontend (`cd frontend && npm install`).
- Run the full build check from the repo root with `npm run build` (installs frontend dev deps automatically and compiles both apps).
- Frontend linting is available via `cd frontend && npm run lint`.
- Local development runs with `npm run dev`, which starts Express (via `nodemon`) alongside Vite.

## Backend Guidelines
- All server files use native ES modules—stick with `import`/`export` and avoid CommonJS `require`/`module.exports`.
- Expose new HTTP handlers as Express routers under `routes/` and mount them from `server.js` under the `/api/...` namespace. Reuse the `auth` middleware for any endpoint that depends on the authenticated user.
- Every model in `models/` is a Mongoose schema. When you add new fields, keep validation, defaults, indexes, and timestamps consistent with existing patterns. Remember to gate queries by the authenticated `userId` (via `req.user` or helpers like `getUserIdFromRequest`).
- Prefer `async/await` for database access, log server-side failures with `console.error('[context]', err)`, and return JSON error payloads in the shape `{ error: 'message' }`.
- Shared helpers belong in `utils/`, and anything that needs request context (like entry automation) should accept a payload rather than pulling from globals.

## Frontend Guidelines
- React components are functional and hook-based. Manage per-page state inside `frontend/src/pages/` and shared UI/state inside `frontend/src/components/` or `frontend/src/contexts/`.
- Fetch data with the shared `frontend/src/api/axiosInstance.js` so auth headers and interceptors remain consistent.
- Keep UI styling consistent with the existing mix of CSS files and utility classes; colocate large page-specific styles in a sibling `.css` file and import it once at the top of the page component.
- Favor lightweight local state (`useState`, `useMemo`, `useEffect`) before introducing new global context. Persist user preferences the way existing pages do (e.g., via `localStorage` helpers or context utilities).
- When adding new routes/pages, wire them into the router definitions under `frontend/src/App.jsx` (or the appropriate routing module) and ensure they gracefully handle loading/error states.

## Testing & Validation
- Before delivering changes, run `npm run build` at the repository root. Run `cd frontend && npm run lint` when you touch frontend code to keep ESLint/Tailwind rules happy.
- If you add behavior that depends on authentication or background jobs, include meaningful logging so issues are discoverable in production logs.

## Pull Request Expectations
- Summaries should call out both backend and frontend impacts when relevant.
- Tests/checks listed in the final report must correspond to real commands you ran in this workspace.
