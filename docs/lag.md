# Website waits and possible causes

This document maps the places where the website waits for an API response, a
Socket.IO event, or a deliberate timer before continuing. It describes what the
current code waits for; it is not a performance measurement. No endpoint timing
or production profiling was performed, so the possible causes below should not
be read as proof that a particular request is slow.

## How to read this guide

- An `await fetch(...)` waits for the HTTP response before the function
  continues. Reading the response body with `response.json()` or
  `response.text()` is another awaited step.
- `Promise.all(...)` lets requests run concurrently, but code after it waits
  until every promise in the group settles successfully.
- A `setTimeout(...)` listed below is an intentional UI/game delay, not waiting
  for the server.
- Socket.IO actions often wait for a later event from the other player or
  server. This is different from an HTTP request/response.

## App startup and sign-in

### Restoring a saved session

`src/contexts/AuthContext.tsx` reads the saved token and user from
`localStorage`. If both exist, it calls `GET /api/auth/me` to verify the token.
`isLoading` remains true until that request finishes. The route guards in
`src/App.tsx` show a full-screen spinner while authentication is loading, so
navigation can appear paused even though a cached user was read locally.

If there is no saved session, the loading state ends without making that
verification request. If the API cannot be reached, the verification request
still has to fail or complete before the `finally` block ends the loading
state.

### Login, registration, and onboarding

The functions in `src/contexts/AuthContext.tsx` wait for their corresponding
requests:

- Login: `POST /api/auth/login`
- Registration: `POST /api/auth/register`
- Profile onboarding: `PUT /api/auth/onboarding`

Login and registration forms reflect this with submit/loading state. Login also
reads an error response body when the server rejects the credentials.

### Initial server and database readiness

`server/index.js` starts `mongoose.connect(MONGODB_URI)` without awaiting that
connection before setting up the rest of the server. The HTTP server begins
listening in the startup block near the end of the file; its listen callback
then awaits default-user initialization and puzzle-order migration.

The database connection, those startup queries, and the migration can affect
how quickly the first API requests complete. The code does not make the HTTP
listener wait for all startup database work to finish, so requests arriving
during initialization may encounter a database that is not ready yet.

## Page data loading

### Puzzles

The initialization effect in `src/pages/Puzzles.tsx` performs these steps in
sequence:

1. `GET /api/puzzle-categories`
2. `GET /api/puzzle-category-order`
3. For admins, `GET /api/groups`
4. `GET /api/puzzles`
5. For students, `GET /api/my-content-access`

Each step is awaited before the next begins, and `isInitializing` is cleared
after the sequence. As a result, the page's initial loading time can include
the sum of these request times, not only the time for the slowest request.
Category selection can also load category puzzle data from
`GET /api/puzzles/category/:category`.

Puzzle creation and management in `src/components/PuzzleCreator.tsx` also wait
for category and puzzle list reads and for create, update, delete, category,
and reorder requests to finish before those actions complete. Creating multiple
variation puzzles involves additional puzzle-create requests.

### Student dashboard

`src/components/StudentDashboard.tsx` loads the following serially:

1. `GET /api/users/:id/activity?limit=1000`
2. `GET /api/users/:id/puzzle-progress`
3. `GET /api/users/:id/attendance`

Dashboard calculations and the end of its loading state occur after those
requests. The activity request asks for up to 1,000 records, so the amount of
activity data and database/network response time can contribute to this wait.

### Admin dashboard

`src/pages/AdminDashboard.tsx` initially loads stats and users. Groups and each
content collection are fetched only when their corresponding tab is viewed;
puzzle counts, categories, and visibility settings are fetched only when an
admin opens an individual student's puzzle-access editor. Successfully loaded
tab resources are retained in memory for the dashboard session.

The users loader then fetches fee records for every student. Those per-student
fee requests run concurrently with another `Promise.all`, and the users loader
does not finish until all of those requests finish. Consequently, a large
student list creates many simultaneous requests, and one slow fee request can
extend the overall initial loading state.

Other admin actions load fees, puzzle recommendations, or access settings when
an admin opens the relevant student view. Selective content assignment loads
each student's access record on demand and caches it, avoiding a repeated
read when the selected content item changes.

### Openings, Famous Mates, and Best Games

`src/pages/Openings.tsx`, `src/pages/FamousMates.tsx`, and
`src/pages/BestGames.tsx` load the content list and, for students, content
access settings when the page initializes. Those loader functions are started
independently, so their network requests can overlap. Each view still depends
on its content-list request to populate the cards; access settings are used to
determine the student's access and ordering.

Opening, famous-mate, and best-game editors wait for their detail request when
editing an item. If that detail request fails, the editor code has a fallback
that requests the full list and searches it for the item, adding another
request/round trip. Saving an item waits for its create or update request.

### Profile

`src/pages/Profile.tsx` loads an admin-selected user's details separately from
attendance. When an admin views a student's profile, puzzle progress and recent
activity are also requested. These reads are started by separate loading
effects, so parts of the page can become ready at different times.

Marking or deleting attendance, updating profile details, and loading progress
or activity wait for their corresponding API requests. Puzzle progress has an
explicit loading indicator.

### Games page

`src/pages/Games.tsx` requests `GET /api/coaches` when the user selects the
coach opponent option. Starting or playing against the local computer does not
require a server response for each move.

## Live games and Socket.IO

`src/services/socketService.ts` connects with the JWT and resolves its
connection promise on the Socket.IO `connect` event. It rejects on
`connect_error` and configures reconnection with up to five attempts and a
one-second reconnect delay. A slow or unavailable server/network can therefore
delay the connection or cause it to fail after retries.

`src/hooks/useLiveGame.ts` starts that connection when a token is present.
Sending a live-game request, accepting/declining one, making a move, offering
or accepting a draw, resigning, or leaving emits a socket event. These emits
do not themselves return an HTTP response; the UI state changes when the
matching server/opponent event arrives. In particular, a game request can
remain pending while waiting for the coach to respond, and a game move waits
for the server's move broadcast to update the other clients. If the socket is
disconnected, `socketService.emit` logs a warning and does not send the event.

## Deliberate delays (not server waits)

- `src/pages/Games.tsx` delays the local computer's move by 500 ms. This is an
  intentional presentation/gameplay pause.
- `src/pages/Puzzles.tsx` delays execution of a preloaded opponent move by
  500 ms and uses 300 ms timers in puzzle feedback/state transitions. These
  delays are local UI behavior, not API response time.
- `src/hooks/useActivityTracker.ts` only records a page visit after more than
  five seconds on that page. This threshold delays/filters the tracking event;
  it does not hold up page navigation.

## Activity tracking

`src/hooks/useActivityTracker.ts` sends activity records to
`POST /api/users/:id/activity`. Page visits, puzzle results, and content views
can create these requests. The record functions await `fetch`, but they catch
and log network errors; activity recording is not intended to provide the
content displayed on the page.

When leaving a page, the hook uses `navigator.sendBeacon` for a page-visit
record rather than waiting for a normal fetch response. A beacon is queued by
the browser and does not provide the page with a normal response to await.

## Common factors that can lengthen a wait

The following are possible contributors, not diagnoses of a measured problem:

- Slow or unstable client internet, DNS, TLS, or browser-to-server connection.
- API server startup/restart, load, or an unavailable server.
- MongoDB connection latency, query duration, or database unavailability.
- Larger results, such as the dashboard activity history or content lists,
  taking longer to query, transfer, and parse.
- Sequential request chains, particularly puzzle initialization and the
  student dashboard.
- Many concurrent requests, particularly per-student fee loading in the admin
  dashboard.
- A required Socket.IO connection or a person needing to respond to a live-game
  request.
- Static JavaScript, CSS, font, and image assets taking time to download on an
  initial visit.

## Caching and timeout notes

API calls in the inspected page and context code use `fetch` directly. A
`QueryClient` is created in `src/App.tsx`, but no `useQuery`, `useMutation`, or
query-client fetch calls were found in `src`; the listed API reads therefore
do not use React Query caching/deduplication. The auth context does cache the
user/token in `localStorage`, but a saved token is still checked with
`/api/auth/me` on app startup.

The inspected frontend API requests do not pass an `AbortSignal` or implement
a common HTTP request timeout/retry wrapper. A request can therefore remain
pending until the browser/network stack completes or fails it. This document
does not establish whether any observed delay is caused by the frontend,
backend, database, hosting, or the user's network; endpoint timing and
production logs would be needed to identify a specific bottleneck.
