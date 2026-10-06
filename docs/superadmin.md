# Super Admin Guide

This guide explains how the Super Admin account and admin workspaces work in
the Chess Coaching Website.

## How admin workspaces work

The website runs as one application with one database. Creating an admin does
not deploy or open a separate copy of the website. Instead, each admin gets an
isolated workspace within the existing website.

Students and admin-managed records are associated with an owner through the
`adminId` field:

- A student’s `adminId` is the `_id` of the admin who owns that student.
- Groups, puzzles, openings, famous mates, best games, and puzzle category and
  category-order settings also have an `adminId`.
- The server assigns ownership from the authenticated admin account when
  records are created. A request cannot set or change ownership to another
  admin.
- Admin list, detail, edit, delete, group, statistics, and content operations
  are scoped to the signed-in admin. Students likewise receive content only
  from their own admin’s workspace, subject to the existing content-access
  settings.

The Super Admin is also an admin for ownership purposes. They can manage their
own students and content, but do not see or manage another admin’s students or
content. Normal admins cannot view or manage admin accounts and cannot change
student roles or ownership. Content sharing and student reassignment between
admins are not implemented.

## Set up the Super Admin

The application does not create a default Super Admin or choose a password at
startup. Promote an existing account directly in MongoDB:

1. Back up the database and confirm which existing account should be the
   Super Admin.
2. Confirm there is not already a Super Admin:

   ```javascript
   db.login.find({ role: "superadmin" }, { username: 1 });
   ```

3. Update the intended existing account, substituting its username:

   ```javascript
   db.login.updateOne(
     { username: "existing-username" },
     { $set: { role: "superadmin" } }
   );
   ```

4. Confirm the account now has that role and that exactly one Super Admin
   exists:

   ```javascript
   db.login.find({ role: "superadmin" }, { username: 1 });
   ```

Use the account’s existing password to sign in. Keep exactly one account with
the `superadmin` role.

## One-time ownership migration

Run the ownership migration after promoting the Super Admin if existing
students or content need to be assigned to that account:

```powershell
node server\scripts\map-existing-students-to-superadmin.js
```

Run this command from the repository root. The script reads
`server\.env` for `MONGODB_URI` and refuses to proceed unless it finds exactly
one Super Admin. It assigns all existing students, groups, puzzles, openings,
famous mates, best games, puzzle categories, and category-order settings to
that Super Admin. It also adjusts legacy unique indexes for group and category
names so different admins can use the same names.

**This is a one-time migration, not a routine maintenance command.** Every run
sets the ownership of every record in those collections to the Super Admin.
Do not run it again after admins have started creating their own students or
content, or their records will be reassigned to the Super Admin.

### Existing activity ownership

To assign existing `UserActivity` records to the Super Admin, run this separate
one-time script from the repository root:

```powershell
node server\scripts\map-user-activities-to-superadmin.js
```

It verifies that account `6950bc7b6beae457a17971b0` is the Super Admin, then
sets only `adminId` on every document in `useractivities`. It does not change
or delete any other activity field. Do not run this again after new admins
have started recording their own activities: rerunning it would reassign all
activity ownership to the Super Admin.

New activity records are assigned server-side to the owning admin. Normal
admins' activity queries are filtered by their `adminId`; the Super Admin can
query all activity records, subject to the existing student ownership checks
on student-specific dashboard pages. Puzzle progress and Manage Access
recommendations use those same activity ownership rules. No puzzle completion
or history fields are rewritten by the activity ownership migration.

## Use Admin Management

Sign in to the existing `/admin` dashboard with the Super Admin account. The
dashboard includes an **Admin Management** tab that is available only to the
Super Admin.

From that tab, the Super Admin can:

- **Create an admin:** choose **Add Admin**, enter a unique username and
  password, and save. The new account is enabled and has the `admin` role.
- **Edit an admin:** change the username and save.
- **Reset an admin’s password:** enter a new password in the edit dialog.
  Leave the password field blank to keep the current password.
- **Enable or disable an admin:** use the access switch. A disabled account
  cannot use the application until re-enabled.
- **Delete an admin:** choose **Delete** and confirm.

Admin account management is also enforced by the server. These endpoints
require a Super Admin session:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/superadmin/admins` | List admin accounts |
| `POST` | `/api/superadmin/admins` | Create an admin with `username` and `password` |
| `PUT` | `/api/superadmin/admins/:id` | Update `username`, `password`, and/or `isEnabled` |
| `DELETE` | `/api/superadmin/admins/:id` | Delete an admin account |

The API does not provide a way to promote an admin or change an account’s role
or owner through these requests.

### Important when deleting an admin

Deleting an admin removes the admin account only; it does not delete or transfer
that admin’s students. Their students and content remain associated with the
deleted account’s `adminId`, so they will not automatically become visible to
the Super Admin or another admin. Disable an account instead if its data may
need to be retained. Back up and plan any data transition separately before
deleting an admin.

## Normal admin workflow

An admin signs in with the credentials created by the Super Admin and uses the
same `/admin` dashboard as before. The admin can manage only their own
students, groups, attendance, fees, activity, puzzles, openings, famous mates,
best games, and related access settings.

New students and content created within that admin’s workspace are stored with
that admin’s `adminId`. Super Admin-created students and content are stored
with the Super Admin’s `adminId`. The server checks ownership for these
operations; hiding items in the frontend is not the security boundary.

Students are created through the admin-managed registration flow and receive
the `student` role. Student requests cannot create an `admin` or `superadmin`
account.

## Related implementation

- The existing schemas, authorization checks, and API routes are in
  [`server/index.js`](../server/index.js).
- The one-time migration is in
  [`server/scripts/map-existing-students-to-superadmin.js`](../server/scripts/map-existing-students-to-superadmin.js).
- Deployment environment setup is documented in
  [`DEPLOYMENT.md`](../DEPLOYMENT.md).
