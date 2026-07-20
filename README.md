# StreamofConshushness

StreamofConshushness is a journal-first life dashboard: a planner for people who think like a scrapbook. Capture comes first. Deterministic automation can surface possible tasks, gather items, interests, and dates, but task-like inferences stay reviewable until the user accepts, edits, or rejects them.

The intended loop is **capture in the Stream → review inferences → act from Today or Calendar → recover the original context through Search and source links**. Journal content and every derived record are owner-scoped private data; this repository does not implement public journal sharing.

## Features

### Core Functionality
- **Rich Journal Entries** - TipTap-powered rich text editor with HTML support
- **Task Management** - Create, track, and organize tasks with due dates and recurrence
- **Ripple Suggestions** - Rule-based, review-first action cues from journal entries
- **Cluster Organization** - Multi-domain life organization with customizable colors and icons
- **Sections (Knowledge Base)** - Organize content into themed wiki-like spaces
- **Calendar & Scheduling** - Day/week/month views with time-blocked scheduling
- **Goals** - Track long-term objectives and their linked tasks
- **Source-Aware Automation** - Review-first suggestions plus traceable calendar extraction
- **Unified Review Inbox** - Review extracted tasks, ripples, gather items, interests, and calendar artifacts from one workflow

### Advanced Features
- **Recurrence Rules** - Standard iCalendar format for repeating tasks and appointments
- **Timezone-Safe Operations** - All dates normalized to Toronto timezone
- **Extensible Adapter System** - Plugin-like UI enhancements

## Tech Stack

### Backend
- **Runtime:** Node.js with ES modules
- **Framework:** Express.js
- **Database:** MongoDB with Mongoose ODM
- **Authentication:** JWT with bcrypt password hashing
- **Security:** Helmet, CORS
- **NLP:** chrono-node for date/time parsing
- **Email:** Nodemailer (optional)

### Frontend
- **Framework:** React 19
- **Routing:** React Router v7
- **Bundler:** Vite
- **Rich Text:** TipTap (ProseMirror)
- **Styling:** Tailwind CSS + custom CSS
- **Notifications:** React Hot Toast
- **HTTP Client:** Axios

## Installation

### Prerequisites
- Node.js 20.19+ and npm
- MongoDB Atlas account (or local MongoDB instance)

### Setup

1. **Clone the repository**
```bash
git clone <repository-url>
cd streamofconshushness
```

2. **Install dependencies**
```bash
# Install root dependencies
npm install

# Install frontend dependencies
cd frontend
npm install
cd ..
```

3. **Configure environment variables**

Create a `.env` file in the root directory if one does not already exist:

```bash
cp -n .env.example .env
```

Do not overwrite an existing `.env` without backing it up; it may contain a working MongoDB Atlas URI or other local secrets. Never commit `.env`. Edit `.env` and set the required values (see [Environment Variables](#environment-variables) section).

4. **Start development servers**

```bash
# Start both backend and frontend in development mode
npm run dev
```

The backend will run on `http://localhost:3000` and the frontend on `http://localhost:5173`.

## Environment Variables

### Required Variables

```bash
# MongoDB connection string
MONGODB_URI="mongodb+srv://username:password@cluster.mongodb.net/dbname"

# JWT secret (production requires at least 32 characters)
JWT_SECRET="your_super_secret_jwt_key_here"

# Server port (default: 3000)
PORT=3000
```

MongoDB Atlas is the easiest setup if local MongoDB is not installed. A localhost URI only works when MongoDB is installed and running; `npm run dev` starts Express and Vite, not MongoDB.

### Optional Variables

```bash
# Environment mode
NODE_ENV=development

# Frontend origin for CORS
CLIENT_ORIGIN=http://localhost:5173

# Base URL for password reset links
APP_BASE_URL=http://localhost:3000

# Trusted reverse-proxy hops (0 when directly exposed; commonly 1 behind one proxy)
TRUST_PROXY_HOPS=0

# Absolute persistent-volume path required in production for private uploads
PRIVATE_UPLOAD_DIR=/var/lib/streamofconshushness/private-uploads

# Explicit local-development opt-in; never enable in production
EXPOSE_AUTH_TEST_CREDENTIALS=false

# SMTP configuration (for password reset emails)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@yourapp.com

# Admin secret for admin endpoints
ADMIN_SECRET=your_admin_secret_here
```

## Scripts

### Root Scripts

```bash
# Development (starts both backend and frontend)
npm run dev

# Production build
npm run build

# Full local verification gate
npm run verify

# Coverage report (unit/integration scope configured in vitest.config.js)
npm run test:coverage

# Read-only duplicate preflight before production index initialization
MONGODB_URI='<staging-copy-uri>' npm run audit:integrity

# Assemble the same production artifact validated in CI (requires a build)
npm run build:artifact

# Focused daily-loop smoke test
npm run test:daily-loop

# Opt-in browser smoke for the primary loop and two-user privacy boundaries
npm run test:browser-smoke

# Start production server (requires build first)
npm start
```

### Frontend Scripts

```bash
cd frontend

# Start Vite dev server
npm run dev

# Build for production
npm run build

# Lint code
npm run lint

# Preview production build
npm run preview
```

## Project Structure

```
streamofconshushness/
├── frontend/               # React frontend application
│   ├── src/
│   │   ├── pages/         # Page components
│   │   ├── components/    # Reusable UI components
│   │   ├── api/           # Axios client and API wrappers
│   │   ├── utils/         # Helper functions
│   │   ├── adapters/      # Extensible plugin system
│   │   ├── App.jsx        # Router and auth provider
│   │   └── main.jsx       # Application entry point
│   └── vite.config.js
├── routes/                # Express route handlers
├── models/                # Mongoose schemas
├── middleware/            # Express middleware (auth, etc.)
├── utils/                 # Shared utilities and NLP logic
├── scripts/               # Utility scripts and migrations
├── private-uploads/       # Ignored local default; production uses PRIVATE_UPLOAD_DIR on persistent storage
├── server.js              # Express server entry point
├── package.json
├── .env.example
├── .gitignore
├── AGENTS.md              # Contributor guidelines
└── README.md
```

## API Endpoints

### Authentication
- `POST /api/register` - Create new account
- `POST /api/login` - Login with username/email
- `POST /api/auth/forgot` - Request password reset
- `POST /api/auth/reset` - Complete password reset
- `POST /api/auth/change-password` - Change password (authenticated)

### Core Resources
- `/api/entries` - Journal entries
- `/api/tasks` - Task management
- `/api/ripples` - Reviewable action cues inferred from journal entries
- `/api/clusters` - Life domain organization
- `/api/sections` - Knowledge base sections
- `/api/section-pages` - Pages within sections
- `/api/notes` - Daily/cluster-scoped notes
- `/api/goals` - Long-term objectives
- `/api/appointments` - Calendar events
- `/api/habits` - Legacy owner-scoped habit data API (the unfinished streak UI is intentionally not exposed)

### Utilities
- `GET /health` - Database readiness (returns 503 until MongoDB is connected)
- `GET /health/live` - Process liveness check
- `/api/review` - Unified review inbox for pending automation artifacts
- GraphQL endpoint is currently not enabled in this build
- `POST /api/upload` - Authenticated private upload creation
- `GET /api/upload/:fileId` - Authenticated owner-only private download
- `GET /__routes_full` - Route inspector (development only; enable explicitly with `EXPOSE_ROUTE_INSPECTOR=true`)

## Development

### Running Tests

```bash
# Run backend tests (when configured)
npm test

# Run focused daily-loop smoke coverage
npm run test:daily-loop

# Run browser-level daily loop smoke against a live local app/database
RUN_BROWSER_SMOKE=1 BROWSER_SMOKE_START_SERVER=1 npm run test:browser-smoke

# Run the full local verification gate
npm run verify

# Run frontend lint
cd frontend && npm run lint
```

The browser smoke uses Playwright and exercises the UI paths from Stream capture through edited Review Inbox acceptance to the dated Daily Page, plus ordinal calendar extraction for `I'm going to visit my mom on the 13th.`. A database-level probe also verifies two-user isolation across the primary private resources and uploads. It requires a working local app with a disposable MongoDB database and a valid `.env`. Install the Chromium browser once with:

```bash
npx playwright install chromium
```

By default, `npm run test:browser-smoke` skips unless `RUN_BROWSER_SMOKE=1` is set. Set `BROWSER_SMOKE_START_SERVER=1` to let Playwright start isolated local smoke servers on frontend port `5174` and API port `3100`, or leave it unset and point `E2E_BASE_URL` / `E2E_API_BASE` at already-running frontend/backend servers.

### Code Style

- **Backend:** ES modules (`import`/`export`), async/await pattern
- **Frontend:** Functional React components with hooks
- **Formatting:** Consistent indentation, descriptive variable names
- **Comments:** Section dividers in large files, explain complex logic

### Contributing

See [AGENTS.md](./AGENTS.md) for detailed contributor guidelines, including:
- Development workflow
- Backend patterns and conventions
- Frontend architecture
- Testing expectations
- Pull request guidelines

## Authentication Flow

1. **Register** - User creates account with username/email and password
2. **Login** - Server validates credentials and returns JWT token (7-day expiry)
3. **Token Storage** - Frontend stores token in localStorage
4. **API Requests** - Token sent in `Authorization: Bearer <token>` header
5. **Protected Routes** - Middleware verifies token on all protected endpoints

## Key Features Explained

### Ripple Extraction

The app uses NLP to automatically extract action items from journal entries:
1. User writes entry in rich text editor
2. System analyzes text for strong intent phrases ("need to", "must", "don't forget")
3. Creates "ripple" records with status `pending`
4. User reviews ripples in `/ripples` page
5. Can approve, dismiss, or convert ripples to tasks

### Cluster System

Clusters are multi-domain life tags:
- Create clusters for life areas (Work, Health, Projects, etc.)
- Customize with colors and emoji icons
- Tag entries, tasks, goals, and appointments
- Filter views by cluster
- Multiple clusters can be assigned to single item

### Sections (Knowledge Base)

Organize content into themed wiki-like spaces:
- Create sections with different layouts (flow, grid, kanban, tree)
- Add pages within sections
- Link journal entries to specific pages
- Build knowledge bases for projects or topics

## Production Deployment

### Build Frontend

```bash
npm run build
```

This builds the React app into `frontend/dist/`.

### Start Production Server

```bash
NODE_ENV=production npm start
```

The Express server will serve the built frontend from `frontend/dist/`.

### Environment Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Configure `MONGODB_URI` with production database
- [ ] Set a strong `JWT_SECRET` (at least 32 random characters)
- [ ] Set the exact browser origin in `CLIENT_ORIGIN`
- [ ] Configure `TRUST_PROXY_HOPS` for the real proxy topology (keep `0` when directly exposed)
- [ ] Mount persistent, non-public storage at `PRIVATE_UPLOAD_DIR`
- [ ] Configure `APP_BASE_URL` for password reset links
- [ ] Set up SMTP credentials if using email features
- [ ] Set `ADMIN_SECRET` for admin operations
- [ ] Ensure `PORT` is configured correctly
- [ ] Run `npm run build` before deployment
- [ ] Back up the database, review `node scripts/migrations/backfillClusterLinks.mjs --dry-run`, then run it with `--apply` only after the counts are understood
- [ ] Review `node scripts/migrations/replaceAppointmentOneOffIndex.mjs --dry-run`, then run it with `--apply` to retire the legacy sparse appointment index
- [ ] Run `npm run audit:integrity` against a backed-up staging copy and resolve every reported duplicate group before production startup creates required indexes

The cluster-link migration never writes by default and refuses to guess a
database URL. Set `MONGODB_URI` explicitly for both the dry run and the apply
run. It also removes cluster references that do not belong to the record owner;
review the reported foreign/missing-reference counts before applying it.
The integrity audit is read-only and reports only category counts, not private
record contents or receipt values.

### Recommended Hosting

- **Backend:** Render, Railway, Heroku, DigitalOcean
- **Database:** MongoDB Atlas (managed MongoDB)
- **Frontend:** Served by Express in production (or separate CDN)

## Security Considerations

- Passwords hashed with bcrypt (10 salt rounds)
- JWT tokens expire after 7 days
- Helmet security headers enabled
- CORS properly configured
- DOMPurify sanitizes HTML content
- Owner-scoped APIs enforce authenticated ownership, with cross-user regression coverage for the primary private resources

## License

[Add your license here]

## Support

For issues, questions, or contributions, please refer to [AGENTS.md](./AGENTS.md).

---

**Built for thoughts that arrive before structure.**
