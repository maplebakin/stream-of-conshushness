# Private upload migration

New uploads are stored in `PRIVATE_UPLOAD_DIR` (or `private-uploads/` locally) and are available only through `GET /api/upload/:fileId` with the owner’s bearer token. The old public `GET /uploads/*` static mount has been removed.

## Legacy files

Existing `/uploads/<filename>` references are intentionally not served through a compatibility route: those files have no owner metadata, so authorizing them safely is impossible. Existing profile pictures using a legacy URL will fall back to the account initial until migrated. Unknown files are not deleted by this change.

Before deployment, back up the database and the legacy `uploads/` directory. For each known owner, migrate a legacy file by creating an `Upload` record with a new opaque `fileId` and `storageName`, `ownerId`, sanitized original name, MIME type, size, and `resourceType: "profile-picture"`; copy the file into `PRIVATE_UPLOAD_DIR`; then update `User.profilePicture` to `/api/upload/<fileId>`. Verify an authenticated owner download before removing the legacy copy.

Files that cannot be assigned to an owner must remain unavailable rather than being republished. Historical Git revisions may still contain previously tracked uploads; removing them requires a separately planned history rewrite and remote/cache cleanup.

## Storage and cleanup contract

Deployments need a persistent, non-public volume mounted at `PRIVATE_UPLOAD_DIR`; the deployment artifact intentionally does not include runtime uploads. Profile-picture replacement or removal marks the old upload metadata deleted before best-effort filesystem cleanup, so it is no longer downloadable even if disk cleanup fails. Generic `image` and `file` uploads are private and `unattached` until a future owning resource explicitly associates and retires them; no account-wide orphan sweeper is introduced in this repair.

Binary image and PDF signatures are checked after upload. Plain text and Markdown still rely on the declared MIME type and extension because this project does not perform full content classification; all download responses use `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`.
