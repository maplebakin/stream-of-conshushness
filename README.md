# Stream of Conshushness

A comprehensive personal productivity and life management application that combines journaling, task management, habit tracking, and goal planning. Organize your life through "clusters" (life domains), track "ripples" (AI-extracted action items), and manage daily entries with rich metadata.

## Features

### Core Functionality
- **Rich Journal Entries** - TipTap-powered rich text editor with HTML support
- **Task Management** - Create, track, and organize tasks with due dates and recurrence
- **Ripple Extraction** - NLP-based action item extraction from journal entries
- **Cluster Organization** - Multi-domain life organization with customizable colors and icons
- **Sections (Knowledge Base)** - Organize content into themed wiki-like spaces
- **Calendar & Scheduling** - Day/week/month views with time-blocked scheduling
- **Goals & Habits** - Track long-term objectives and daily habits
- **Smart Automation** - Auto-extract events, tasks, and metadata from entries
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

# JWT secret (minimum 12 characters)
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

# Focused daily-loop smoke test
npm run test:daily-loop

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
├── uploads/               # File upload directory
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
- `/api/ripples` - AI-extracted action items
- `/api/clusters` - Life domain organization
- `/api/sections` - Knowledge base sections
- `/api/section-pages` - Pages within sections
- `/api/notes` - Daily/cluster-scoped notes
- `/api/goals` - Long-term objectives
- `/api/appointments` - Calendar events
- `/api/habits` - Habit tracking

### Utilities
- `GET /health` - Health check endpoint
- `/api/review` - Unified review inbox for pending automation artifacts
- GraphQL endpoint is currently not enabled in this build
- `GET /uploads/*` - Static file serving
- `GET /__routes_full` - Route inspector (development only)

## Development

### Running Tests

```bash
# Run backend tests (when configured)
npm test

# Run focused daily-loop smoke coverage
npm run test:daily-loop

# Run the full local verification gate
npm run verify

# Run frontend lint
cd frontend && npm run lint
```

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
- [ ] Set strong `JWT_SECRET` (16+ random characters)
- [ ] Configure `APP_BASE_URL` for password reset links
- [ ] Set up SMTP credentials if using email features
- [ ] Set `ADMIN_SECRET` for admin operations
- [ ] Ensure `PORT` is configured correctly
- [ ] Run `npm run build` before deployment

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
- All queries filtered by authenticated user ID

## License

[Add your license here]

## Support

For issues, questions, or contributions, please refer to [AGENTS.md](./AGENTS.md).

---

**Built with ❤️ for personal productivity and mindful organization.**
