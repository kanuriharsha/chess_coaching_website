# Website Overview

Chess Coach is a chess-learning and coaching website for students and admins/coaches. Students solve puzzles, study curated chess material, practice against a computer or coach, and review learning activity. Admins manage users, groups, permissions, attendance, fees, and instructional content.

## Contents

- [Roles and user journeys](#roles-and-user-journeys)
- [Screens and routes](#screens-and-routes)
- [Core features](#core-features)
- [Architecture and project layout](#architecture-and-project-layout)
- [Data and persistence](#data-and-persistence)
- [Local development](#local-development)
- [Related docs](#related-documents)

## Roles and user journeys

### Student

1. Signs in with an enabled account.
2. Completes onboarding with personal/student profile information when prompted.
3. Uses the student dashboard to review activity, puzzle progress, and attendance-derived streaks.
4. Practices puzzles and visits openings, famous mates, and best games when granted access.
5. Plays a local chess game against the computer or requests a live game with a coach.
6. Reviews their profile, attendance, achievements, and activity.

### Admin / coach

1. Signs in and is routed to the admin dashboard.
2. Manages student accounts, groups, and group membership.
3. Configures access to puzzles, openings, famous mates, and best games.
4. Creates and edits puzzles and curated content.
5. Tracks student attendance, fees, puzzle progress, activity, and recommendations.
6. Accepts live-game requests and coaches students through real-time games.

## Screens and routes

All application screens are React routes defined in `src/App.tsx`. Except for login/onboarding, they are behind the authenticated route wrapper. There is no separate backend web UI.

| Route | Screen | Main behavior |
|---|---|---|
| `/` | Login entry | Sends signed-in users to their dashboard/content and signed-out users to login. |
| `/login` | Login | Authenticates users and stores a JWT-backed session. |
| `/onboarding` | Onboarding | Collects and saves student profile information. |
| `/dashboard` | Student dashboard | Displays puzzle progress, activity charts, weekly metrics, and streak/progress summaries. Admin accounts are redirected to `/admin`. Some dashboard presentation data, including weekly goal and initial chart placeholders, is generated client-side. |
| `/admin` | Admin dashboard | Student/user administration, content access, puzzle/content management, attendance, group management, fee tracking, activity, and progress views. |
| `/puzzle-manager` | Puzzle manager | Puzzle administration workspace. |
| `/puzzles` | Puzzles | Categorized chess puzzle practice with board interaction, hints, progress tracking, and category/access controls. |
| `/games` | Games | Local play against a computer and live coach game requests/play. Uses chess.js for local move rules and Socket.IO for live sessions. |
| `/openings` | Openings | Browse and step through opening lines and move commentary. |
| `/openings/create` | Opening editor | Create an opening with a visual board/move editor. |
| `/openings/edit/:id` | Opening editor | Edit an existing opening. |
| `/famous-mates` | Famous mates | Browse and replay curated checkmate patterns. |
| `/famous-mates/create` | Famous mate editor | Create a curated mate sequence. |
| `/famous-mates/edit/:id` | Famous mate editor | Edit a curated mate sequence. |
| `/best-games` | Best games | Browse and replay annotated/curated games. |
| `/best-games/create` | Best game editor | Create a game, move sequence, and highlighted moves. |
| `/best-games/edit/:id` | Best game editor | Edit a curated game. |
| `/profile` | Current user's profile | View and update profile and inspect attendance/activity/progress where supported. |
| `/profile/:userId` | User profile | Admin-facing view for a selected student profile and related records. |
| `*` | Not found | Handles unknown routes. |

Navigation is a desktop sidebar and a mobile bottom bar with an expanded menu. It links to the dashboard, puzzles, games, openings, famous mates, best games, and profile; the admin dashboard is shown to admins.

## Core features

### Chess learning content

- **Puzzles:** FEN-based positions, move solutions, optional hints/preloaded moves, three difficulty labels, category ordering, custom categories, and branching move trees.
- **Openings:** SAN move lines with comments and move evaluations.
- **Famous mates:** Replayable mate sequences with comments and evaluations.
- **Best games:** Player/title metadata, move lists, categories (`brilliant`, `best`, `blunder`), and highlighted move indexes.
- **Access controls:** Admin-configured category-based puzzle access and selected-item access for other content. Group settings also affect puzzle-category visibility.

### Chess play and coaching

- Local games use chess.js and run in the browser; the computer opponent currently selects a random legal move rather than using a chess engine.
- Live games use Socket.IO, authenticated by the user's JWT.
- Students can direct a game request to a coach or request one from an available coach.
- Admins accept/decline; accepting assigns colors, initial position, and time control.
- The server validates live moves and manages timers, draw offers, resignations, timeouts, reconnect snapshots, and player online status.
- Live games are transient: they are not saved as MongoDB game history.

### Student management and tracking

- Account enable/disable, role/profile management, student groups, joining dates, and achievements.
- Attendance records with present/absent status and optional notes, including bulk attendance updates.
- Monthly fee records, payment status, and admin notes.
- Activity history and derived puzzle progress/recommendations.
- Page/activity tracking is implemented through the activity hook and backend activity endpoints.

### User experience

The frontend uses React 18, TypeScript, React Router, Tailwind CSS, shadcn/ui components (Radix primitives), React Query provider setup, Lucide icons, Recharts, Sonner/toast notifications, chess.js, and Socket.IO client. The site adapts navigation for mobile and desktop and includes chess move sounds.

## Architecture and project layout

| Path | Responsibility |
|---|---|
| `src/App.tsx` | Providers, route declarations, and auth/onboarding route guards. |
| `src/pages/` | Route-level screens for users, admins, games, puzzles, profiles, and content. |
| `src/components/` | Shared page layout, navigation, chessboards, live games, editors, and dashboard UI. |
| `src/components/ui/` | Reusable UI primitives based on shadcn/ui and Radix. |
| `src/contexts/AuthContext.tsx` | Login/session state, user loading, registration, and user management client methods. |
| `src/hooks/` | Activity tracking, chess sounds, toast helpers, responsive state, and live-game state. |
| `src/lib/chess.ts` | Chess-related client helpers. |
| `src/services/socketService.ts` | Socket.IO connection, events, reconnection, and listener management. |
| `server/index.js` | Express REST API, Mongoose schemas, JWT checks, Socket.IO live game logic, and development initialization. |
| `public/` | Static public assets. |
| `docs/` | Project documentation. |

### Request flow

1. React uses `VITE_API_URL` as the REST API root (default `http://localhost:5000/api`).
2. AuthContext sends credentials to `/auth/login`, then keeps the returned JWT and user cache in browser `localStorage`.
3. API calls that authenticate send the JWT in the `Authorization` header; page guards use the cached/current user to redirect unauthenticated users.
4. The backend verifies tokens in the handlers that require them and reads/writes MongoDB through Mongoose.
5. Live games connect separately to Socket.IO at the backend origin and use the same JWT via handshake auth.

## Data and persistence

MongoDB stores users, groups, puzzles, openings, famous mates, best games, category/access configuration, and user activity. Attendance, achievements, and fee records are embedded in user documents. Puzzle progress and recommendations are derived from puzzle activity and current enabled puzzles rather than stored as independent progress documents.

Socket connections, game requests, active game states, clocks, and timers are kept in server process memory. Restarting the backend clears these active sessions. See [schema.md](schema.md) for collection field definitions and [api.md](api.md) for REST and Socket.IO contracts.

## Local development

### Prerequisites

- Node.js and npm.
- A MongoDB instance and connection URI.

### Install and configure

Install both application dependency sets from the repository root:

```bash
npm install
npm --prefix server install
```

Configure frontend and backend environment files (do not commit secret values):

- Frontend: `VITE_API_URL=http://localhost:5000/api` (see the root `sample.env`).
- Backend: `PORT=5000`, `MONGODB_URI=<your MongoDB connection string>`, and `JWT_SECRET=<a strong random secret>`. `CORS_ORIGIN` can be set for a deployed frontend origin.

Run the frontend and backend in separate terminals:

```bash
npm run dev
npm run dev:server
```

The frontend is normally served by Vite at `http://localhost:5173`; the API and Socket.IO server defaults to port `5000`. In development, the server creates a default `admin` and `student` account if the database has no user for those respective roles. Set secure credentials and secrets for any shared or deployed environment.

Useful root scripts: `npm run build`, `npm run lint`, and `npm run preview`. The backend scripts are `npm --prefix server run dev` and `npm --prefix server start`.

## Related documents

- [api.md](api.md) — REST endpoints, authentication notes, request payloads, and Socket.IO events.
- [schema.md](schema.md) — MongoDB collections and client-side persisted session state.
- [README.md](../README.md) — project setup and deployment summary.
- [DEPLOYMENT.md](../DEPLOYMENT.md) — deployment instructions.
