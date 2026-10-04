# Data Schema

The backend uses MongoDB through Mongoose. The collection names below are explicitly set in `server/index.js`. Unless stated otherwise, Mongoose supplies each document with `_id` and `__v`. Date fields are BSON dates in MongoDB and are serialized as ISO strings in JSON responses.

## Collections

### `login` — User

| Field | Type | Required/default | Description |
|---|---|---|---|
| `username` | String | Required, unique | Login name. |
| `password` | String | Required | Credential field used by the login handler. |
| `role` | String | `student`; enum `admin`, `student` | Account role. |
| `isEnabled` | Boolean | `true` | Whether login is allowed. |
| `onboardingComplete` | Boolean | `false` | Student onboarding state. |
| `joiningDate` | Date | Optional | Date the student joined. |
| `groupId` | ObjectId → `groups` | `null` | Assigned group. |
| `attendance` | Array of subdocuments | `[]` | `{ date: Date (required), status: "present" \| "absent" (required), note?: String }`. |
| `achievements` | Array of subdocuments | `[]` | `{ title: String (required), description?: String, date: Date (defaults now), icon: String (defaults "🏆") }`. |
| `profile` | Embedded object | Optional | `fullName`, `classDesignation`, `phone`, `gender`, `dateOfBirth`, `fatherName`, `motherName`, `email`, `village`, `state`, `country`, and `schoolName` (all strings). |
| `fees` | Array of subdocuments | `[]` | `{ month: Number (required; 1-12 intended), year: Number (required), paid: Boolean (false), secretNote: String (""), secretVisible: Boolean (false), createdAt: Date, updatedAt: Date }`. |
| `commonNote` | String | `""` | Admin-maintained note on the user. |
| `createdAt` | Date | Now | Account creation timestamp. |
| `updatedAt` | Date | Now | Last update timestamp; updated explicitly by relevant handlers. |

`password` is present in the current schema. Most user reads explicitly omit it, but API responses vary by route; do not treat an arbitrary user response as safe for public exposure.

### `groups` — Group

| Field | Type | Required/default | Description |
|---|---|---|---|
| `name` | String | Required, unique, trimmed | Group name. |
| `description` | String | `""` | Optional description. |
| `createdAt` | Date | Now | Creation timestamp. |

User documents refer to a group through `groupId`. Deleting a group unassigns its members.

### `puzzles` — Puzzle

| Field | Type | Required/default | Description |
|---|---|---|---|
| `name` | String | Required | Puzzle display name. |
| `category` | String | Required | Category identifier/name. |
| `description` | String | Optional | Supporting description. |
| `fen` | String | Required | Starting board position in FEN. |
| `solution` | Array of String | `[]` | Expected solution moves. |
| `hint` | String | Optional | Student hint. |
| `difficulty` | String | `medium`; enum `easy`, `medium`, `hard` | Difficulty level. |
| `icon` | String | `"♔"` | Display icon. |
| `isEnabled` | Boolean | `true` | Whether the puzzle is enabled. |
| `allowedGroups` | Array of ObjectId → `groups` | `[]` | Group associations used by puzzle/category access behavior. |
| `preloadedMove` | String | Optional | Move automatically played before student response. |
| `successMessage` | String | `"Checkmate! Brilliant move!"` | Completion message. |
| `order` | Number | `0` | Manual ordering within the category. |
| `moveTree` | Mixed | `null` | Optional branching tree represented as move nodes with IDs, SAN moves, and parent IDs. |
| `createdAt`, `updatedAt` | Date | Now | Timestamps. |

### `openings` — Opening

| Field | Type | Required/default | Description |
|---|---|---|---|
| `name` | String | Required | Opening name. |
| `description` | String | Optional | Opening description. |
| `category` | String | Required | Opening category. |
| `startFen` | String | Optional | Custom starting board position. |
| `moves` | Array | `[]` | `{ san: String (required), comment?: String, evaluation?: "best" \| "brilliant" \| "good" \| "inaccuracy" }`. |
| `isEnabled` | Boolean | `true` | Enabled state. |
| `createdAt`, `updatedAt` | Date | Now | Timestamps. |

### `famousmates` — FamousMate

| Field | Type | Required/default | Description |
|---|---|---|---|
| `name` | String | Required | Mate pattern/name. |
| `description` | String | Optional | Description. |
| `category` | String | `"Famous Mates"` | Category. |
| `startFen` | String | Optional | Custom starting position. |
| `moves` | Array | `[]` | Same move object as Opening: required `san`, optional `comment`, and optional evaluation enum. |
| `isEnabled` | Boolean | `true` | Enabled state. |
| `createdAt`, `updatedAt` | Date | Now | Timestamps. |

### `bestgames` — BestGame

| Field | Type | Required/default | Description |
|---|---|---|---|
| `title` | String | Required | Game title. |
| `players` | String | Required | Player names/description. |
| `description` | String | Optional | Game notes. |
| `category` | String | `"best"`; enum `brilliant`, `best`, `blunder` | Curated category. |
| `startFen` | String | Optional | Custom starting position. |
| `moves` | Array of String | `[]` | Move sequence in SAN. |
| `highlights` | Array of Number | `[]` | Highlighted move indexes. |
| `isEnabled` | Boolean | `true` | Enabled state. |
| `createdAt`, `updatedAt` | Date | Now | Timestamps. |

### `puzzlecategories` — PuzzleCategory

| Field | Type | Required/default | Description |
|---|---|---|---|
| `categoryId` | String | Required, unique | Category slug/identifier. |
| `name` | String | Required | Display name. |
| `description` | String | `"Custom puzzle category"` | Description. |
| `icon` | String | Pawn glyph | Display icon. |
| `order_index` | Number | `999` | Admin display order. |
| `createdAt` | Date | Now | Creation timestamp. |

### `puzzlecategoryorder` — PuzzleCategoryOrder

Stores visibility and order for both built-in and custom categories.

| Field | Type | Required/default | Description |
|---|---|---|---|
| `categoryId` | String | Required, unique | Category identifier. |
| `order_index` | Number | Required, `0` | Display order. |
| `isEnabled` | Boolean | `true` | Category visibility. |
| `allowedGroups` | Array of ObjectId → `groups` | `[]` | Groups allowed to see this category when group filtering is configured. |
| `groupsConfigured` | Boolean | `false` | Whether `allowedGroups` should be used as a restriction. |

### `contentaccess` — ContentAccess

| Field | Type | Required/default | Description |
|---|---|---|---|
| `userId` | ObjectId → `login` | Required | User this access configuration belongs to. |
| `puzzleAccess` | Mixed object | `{}` | Per-category settings. Existing defaults have `{ enabled, limit, rangeStart, rangeEnd, specificPuzzles }` for built-in categories; custom keys are supported. |
| `openingAccess` | Object | `{ enabled: false, allowedOpenings: [] }` | Opening permissions. |
| `famousMatesAccess` | Object | `{ enabled: false, allowedMates: [] }` | Famous-mate permissions. |
| `bestGamesAccess` | Object | `{ enabled: false, allowedGames: [] }` | Best-game permissions. |
| `createdAt`, `updatedAt` | Date | Now | Timestamps. |

### `useractivities` — UserActivity

| Field | Type | Required/default | Description |
|---|---|---|---|
| `userId` | ObjectId → `login` | Required | Activity owner. |
| `type` | String | Required; enum below | Kind of tracked activity. |
| `description` | String | Required | Human-readable summary. |
| `timestamp` | Date | Now | When it happened. |
| `duration` | Number | Optional | Duration in seconds. |
| `details` | Embedded object | Optional | `page`, `puzzleId`, `puzzleName`, `category`, `attempts`, `result` (`passed`/`failed`), and `timeSpent`. |

Allowed `type` values are `page_visit`, `puzzle_attempt`, `puzzle_solved`, `puzzle_failed`, `opening_viewed`, `game_viewed`, `login`, and `logout`. Compound indexes support recent activity lookup and puzzle progress aggregation.

## Runtime-only live-game data

Live game sessions and pending game requests are held in Node.js `Map` objects, not persisted in MongoDB. A game contains an ID, white/black player IDs and usernames, FEN, SAN move list, mode (`normal`/`friendly`), time control, remaining clocks, whose turn it is, status, optional result/reason, and start/last-move timestamps. These records disappear when the server restarts; a finished game is also removed after five minutes.

## Client-side state

The browser stores the current JWT under `chessCoach_token` and cached user JSON under `chessCoach_user` in `localStorage`. The cache is refreshed from `GET /auth/me` when an existing token is checked. This is session cache, not a MongoDB collection.

