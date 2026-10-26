# Dynamic learning columns

Learning sections are stored in `columns`; their entries are stored in `columncontents`.
Each column is owned by an admin and stores its title, supported icon, enabled state,
display order, and legacy content format (`opening`, `bestGame`, `famousMate`, or
`generic`). Content items retain their original fields, including their moves, move
comments and evaluations, highlights, FEN, and enabled state.

Students receive column permissions in `contentaccess.columnAccess`, keyed by column
ID. Each setting has `enabled` and `allowedContentIds`. An enabled setting with an
empty ID list means all enabled content in that column; disabled or absent settings
grant no access. Super Admin grants to an admin are kept separately in
`adminpuzzleaccess.columnAccess` and remain limited to explicit content IDs. Puzzle
settings in `adminpuzzleaccess.puzzleAccess` and puzzle ownership are not migrated
into column permissions.

## Migration

1. Stop writes to the application and ensure `server/.env` has the production
   `MONGODB_URI` for the intended database. Do not run this against a test database
   by accident.
2. From the project root, run:

   ```powershell
   npm --prefix server run migrate:columns
   ```

3. The migration does not create database backup collections. Ensure any required
   backup or rollback plan is handled separately before running it.
4. The migration uses stable IDs for legacy columns and preserves each legacy
   content `_id`; this is how existing student and Super Admin grants map to the
   new records. It uses insert-only upserts for content and columns and merges only
   missing permission keys, so rerunning it does not duplicate or overwrite content
   created after migration.
5. Verify the reported record count, inspect the new collections and their
   permissions, then restart the server and deploy the frontend.

The legacy collections are intentionally retained; the migration does not drop or
rewrite them. This permits rollback and preserves unrelated APIs while clients move
to the dynamic column endpoints.

## Permission behavior

- Admin CRUD operations are scoped to the authenticated admin's `adminId`.
- An admin can view explicitly granted Super Admin content but cannot modify it.
- Students see only enabled columns containing at least one enabled content item
  allowed both by their admin grant and by their own `columnAccess`.
- Normal admin-created puzzles continue to use their existing admin ownership and
  do not depend on Super Admin puzzle grants.
