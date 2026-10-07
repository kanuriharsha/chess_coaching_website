# API Reference

This document describes the Express and Socket.IO interfaces implemented in `server/index.js`.

## Base URLs and conventions

- REST base URL: `http://localhost:5000/api` by default. Set the frontend build-time variable `VITE_API_URL` to the full API base URL (including `/api`) when deploying elsewhere.
- Socket.IO connects to the server origin (the frontend strips `/api` from `VITE_API_URL`).
- REST request bodies are JSON unless otherwise noted.
- Authenticated REST routes expect `Authorization: Bearer <JWT>`. The token is issued at login and expires after seven days.
- Socket.IO authentication uses `auth: { token: "<JWT>" }` in the connection handshake.
- MongoDB document IDs are used for `:id`, `:userId`, and similar path parameters unless a route describes another ID.
- Error responses generally use `{ "message": "..." }`; successful responses vary by endpoint and are described below.

**Authentication is enforced route by route, not by a global middleware.** “Public” below means the route itself does not verify a JWT. The React application protects most page routes, but that client-side protection does not make an otherwise public API private. In particular, content-access reads and several content-list reads only have the checks explicitly called out below.

## REST endpoints

### Authentication and users

| Method and path | Access | Purpose and result |
|---|---|---|
| `POST /auth/register` | No token | Body: `{ username, password, role? }` (`role` defaults to `student`). Creates an enabled user and returns `201 { success, user }`. |
| `POST /auth/login` | No token | Body: `{ username, password }`. Returns `{ token, user }` on success. Disabled users are rejected. |
| `GET /auth/me` | Bearer token | Validates the token and returns the current user without the password. |
| `PUT /auth/onboarding` | Bearer token | Body: `{ profile }`. Saves the caller's profile, marks onboarding complete, and returns `{ success, user }`. |
| `GET /users` | Admin token | Lists users without passwords; group information is populated as `groupId` and `groupName`. |
| `GET /coaches` | No token | Lists enabled admin accounts as `{ _id, username }`. |
| `PUT /users/:id` | Admin token | Updates supported user fields: `username`, `password`, `role`, `isEnabled`, `joiningDate`, `profile`, `achievements`, and `commonNote`. Returns `{ success, user }`. |
| `DELETE /users/:id` | Admin token | Deletes the user; returns `{ success, message }`. |
| `GET /users/:id/puzzle-recommendations` | Admin token | Returns category progress, overall average, remaining puzzles, and catch-up/continue recommendations. |

### Attendance, fees, groups, and activity

| Method and path | Access | Purpose and result |
|---|---|---|
| `POST /users/:id/attendance` | Admin token | Body: `{ date, status, note? }`; adds or replaces that user's record for the date. Returns `{ success, attendance }`. |
| `GET /users/:id/attendance` | Any non-empty bearer token | Returns the user's attendance array. This handler checks only that an Authorization value is present; it does not verify the JWT or compare the requested user ID with the caller. |
| `DELETE /users/:id/attendance?date=...` | Owner or admin | Removes the record for a date. Alternatively use `daysBefore=<number>` instead of `date`. |
| `POST /attendance/bulk` | Admin token | Body: `{ date, attendanceRecords: [{ userId, status, note? }] }`; creates or replaces attendance for each listed user. |
| `GET /users/:id/fees` | Owner or admin | Returns the user's fee-record array. |
| `POST /users/:id/fees` | Admin token | Body: `{ month, year, paid? }`. Returns `201 { success, fees }`. |
| `PUT /users/:id/fees/:feeId` | Admin token | Updates provided fee fields (`paid`, `secretNote`, `secretVisible`, `month`, `year`). Returns `{ success, fee }`. |
| `DELETE /users/:id/fees/:feeId` | Admin token | Deletes the selected fee record. |
| `GET /groups` | Admin token | Lists groups with member counts. |
| `POST /groups` | Admin token | Body: `{ name, description? }`. Creates a group and returns `201 { success, group }`. |
| `PUT /groups/:id` | Admin token | Updates a group's name and/or description. |
| `DELETE /groups/:id` | Admin token | Deletes a group and unassigns its members. |
| `PUT /users/:id/group` | Admin token | Body: `{ groupId }`; use `null` to unassign. Returns `{ success, groupId, groupName }`. |
| `POST /users/:id/activity` | Owner or admin | Body: `{ type, description, duration?, details? }`; stores an activity and returns `201` with the record. Puzzle events require `details.puzzleId` and `details.attemptId`; the server atomically records progress and history. |
| `POST /users/:id/activity/beacon` | Owner token in body | Unload/beacon variant of activity creation. Body includes `type`, `description`, optional `duration`/`details`, and `_token`. |
| `GET /users/:id/activity` | Owner or admin | Returns newest-first activity records. Optional query parameters: `limit` (default 50), `startDate`, `endDate`, and `type`. |
| `GET /users/:id/activity/summary` | Owner or admin | Optional `startDate`/`endDate`; returns `{ summary, puzzleStats }` aggregate data. |
| `DELETE /activity/cleanup?daysOld=30` | Admin token | Deletes activities older than the specified number of days. |
| `GET /users/:id/puzzle-progress` | Owner or admin | Returns per-category puzzle totals, solved state, and persistent attempt totals from `puzzleprogress`. |

## Puzzle-progress migration

From the `server/` directory, `node scripts/migrate-puzzle-progress.js` prints a dry-run reconstruction and performs no writes. After reviewing the preview and pausing puzzle submissions, run `node scripts/migrate-puzzle-progress.js --apply` to create/verify the unique index and migrate progress. The script does not delete or rewrite `useractivities`; it is safe to rerun and never changes an already-completed progress record. Reconstruction counts failed events in timestamp order and includes the first success; legacy `details.attempts` is a visit-local move ordinal, so it is only used to order events with equal timestamps.

### Puzzles and categories

| Method and path | Access | Purpose and result |
|---|---|---|
| `GET /puzzles` | No token required; optional token affects results | Returns puzzles sorted by `order`. Admins can see disabled puzzles; other callers get enabled puzzles only. |
| `GET /puzzles/category/:category` | No token required; optional token affects results | Lists enabled puzzles in a category. Category visibility and configured group restrictions are applied for non-admin viewers. |
| `POST /puzzles` | Admin token | Creates a puzzle; its category order is assigned by the server. `allowedGroups` defaults to all groups when omitted. |
| `PUT /puzzles/:id` | Admin token | Updates a puzzle and its `updatedAt` timestamp. |
| `DELETE /puzzles/:id` | Admin token | Deletes a puzzle. |
| `POST /puzzles/reorder` | Admin token | Body: `{ puzzleOrders: [{ id, order }] }`; updates puzzle ordering. |
| `GET /puzzle-categories` | No token | Lists custom puzzle categories. |
| `POST /puzzle-categories` | Admin token | Creates a custom category. |
| `DELETE /puzzle-categories/:categoryId` | Admin token | Deletes the custom category identified by its category ID. |
| `GET /puzzle-category-order` | No token | Lists ordering and visibility settings for default and custom categories. |
| `PUT /puzzle-category-order` | Admin token | Body: `{ order: [{ categoryId, order_index, isEnabled?, allowedGroups? }] }`; saves category settings. |
| `PUT /puzzle-category-visibility/:categoryId` | Admin token | Updates the visibility settings for one category. |

### Learning content and access

The content-list routes require authentication. Admins receive enabled and disabled records so they can manage visibility; student responses omit disabled records and apply the relevant content-access settings. Disabled content is not returned as a locked card.

| Method and path | Access | Purpose and result |
|---|---|---|
| `GET /openings` | Any valid token | Lists enabled openings for students, filtered by access; admins receive all openings. |
| `POST /openings` | Admin token | Creates an opening; body follows the [Opening schema](schema.md#opening). |
| `PUT /openings/:id` | Admin token | Updates an opening. |
| `DELETE /openings/:id` | Admin token | Deletes an opening. |
| `GET /famous-mates` | Any valid token | Lists enabled famous mates for students, filtered by access; admins receive all famous mates. |
| `GET /famous-mates/:id` | Any valid token | Returns an accessible famous mate or `404`. |
| `POST /famous-mates` | Admin token | Creates a famous mate; body follows the [FamousMate schema](schema.md#famousmate). |
| `PUT /famous-mates/:id` | Admin token | Updates a famous mate. |
| `DELETE /famous-mates/:id` | Admin token | Deletes a famous mate. |
| `GET /bestgames` | Any valid token | Lists enabled best games for students, filtered by access; admins receive all best games. |
| `POST /bestgames` | Admin token | Creates a best game; body follows the [BestGame schema](schema.md#bestgame). |
| `PUT /bestgames/:id` | Admin token | Updates a best game. |
| `DELETE /bestgames/:id` | Admin token | Deletes a best game. |
| `GET /stats` | Admin token | Returns student and content totals. |
| `GET /content-access/:userId` | Admin or matching user | Gets/creates the specified user's access record. |
| `GET /my-content-access` | Any valid token | Gets/creates the caller's access record. |
| `PUT /content-access/:userId` | Admin token | Creates or updates a user's puzzle, opening, famous-mate, and best-game access configuration. |

### Live-game request fallback

| Method and path | Access | Purpose and result |
|---|---|---|
| `GET /game-requests` | Admin token | Returns pending game requests currently held in server memory. The primary mechanism is Socket.IO. |

## Socket.IO live games

Connect to the server origin with a JWT in the Socket.IO `auth` object. An invalid or missing token rejects the connection. Game requests, active games, and timers are stored in server memory; a server restart loses them. Finished games are removed from memory after five minutes.

### Client-to-server events

| Event | Payload | Notes |
|---|---|---|
| `game:request-send` | `{ mode?: "normal" \| "friendly", targetAdminId? }` | Creates a request and notifies connected, available admins. |
| `game:request-cancel` | `{ requestId }` | Cancels the caller's pending request. |
| `game:request-accept` | `{ requestId, timeControl?: { initial, increment } }` | Admin accepts; time values are seconds. Default is 600 seconds, zero increment. |
| `game:request-decline` | `{ requestId }` | Admin declines a request. |
| `game:make-move` | `{ gameId, from, to, promotion?, fen? }` | Submits a chess move; server validates it and broadcasts the resulting state. |
| `game:resign` | `{ gameId }` | Resigns the caller's active game. |
| `game:offer-draw` | `{ gameId }` | Offers a draw to the opponent. |
| `game:accept-draw` | `{ gameId }` | Accepts an outstanding draw offer. |
| `game:checkmate` | `{ gameId }` | Reports checkmate detected by the client. |
| `game:stalemate` | `{ gameId }` | Reports stalemate detected by the client. |
| `game:leave` | `{ gameId }` | Leaves an active game. |

### Server-to-client events

| Event | Payload/meaning |
|---|---|
| `game:request` | Game request delivered to a coach. |
| `game:request-sent` | Confirmation to the student, including a request ID; may indicate `no_admin_found` or `admin_unavailable`. |
| `game:request-cancelled` | `{ requestId }` cancellation broadcast. |
| `game:request-response` | Request acceptance/decline response; acceptance includes the game. |
| `game:started` | Initial game state for both players. |
| `game:resume` | Current game snapshot sent when a player reconnects. |
| `game:move` | Validated move and updated FEN, move list, clock values, and turn. |
| `game:time-update` | Current remaining white/black clock values and turn, emitted once per second. |
| `game:ended` | `{ gameId, result, reason }`. Reasons include checkmate, resignation, timeout, draw, and leaving. |
| `game:draw-offered` | Opponent has offered a draw. |
| `game:player-status` | Player online/offline state for the opponent. |
| `user:online` | Student online notification sent to other connected sockets. |
| `error` | Event-specific error such as a request not found or caller not authorized to accept. |

## Common HTTP status codes

- `200`: successful read or update.
- `201`: successful create.
- `400`: invalid or missing route input.
- `401`: missing or invalid authentication.
- `403`: valid identity without required role/ownership.
- `404`: referenced record not found.
- `500`: server/database error.
