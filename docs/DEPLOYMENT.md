# Database and deployment runbook

## Architecture

- Browser: static HTML/CSS/JavaScript on GitHub Pages.
- Runtime configuration: generated `config.js`; never committed.
- Database/API: Supabase Postgres + PostgREST.
- Schema changes: ordered SQL files in `supabase/migrations`.
- Deployment: GitHub Actions with a GitHub Pages environment.

Only the Supabase anon key may reach the browser. Supabase access tokens,
database passwords, and the `service_role` key are server-side secrets.

## 1. Apply the database baseline

Install/login to the Supabase CLI, link the live project, inspect the pending
SQL, then push it:

```powershell
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push --dry-run
npx supabase db push
```

The baseline is additive and preserves existing data. It also adds
`resource_requests.project_codes`, which the current UI already sends but the
live table does not yet expose.

For each future DB change:

```powershell
npx supabase migration new short_change_name
npx supabase db reset   # local only; destroys the local DB
npx supabase db push --dry-run
```

Never use `db reset` against the linked production project.

## 2. Configure GitHub

In repository **Settings → Secrets and variables → Actions → Variables**, add:

| Variable | Value |
| --- | --- |
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `SUPABASE_ANON_KEY` | Supabase public anon key |
| `DEPLOY_ENTRYPOINT` | `resource_standalone.html` for the present PoC |

In **Settings → Pages**, select **GitHub Actions** as the source. A push to
`main` or a manual run then builds and publishes the site. The workflow refuses
to deploy if required configuration or the selected entrypoint is missing.

The current default is `resource_standalone.html`, because it is self-contained
and functional. Change `DEPLOY_ENTRYPOINT` to `index.html` only after restoring
these referenced modules:

- `views/create.js`
- `views/pending.js`
- `views/history.js`
- `views/budget.js`
- `views/license.js`
- `views/device.js`
- `views/bulk_import.js`
- `views/settings.js`
- `views/resource.js`
- `views/cost.js`

## 3. Rollback

- Frontend: redeploy a known-good commit from GitHub Actions.
- Database: write a forward-only corrective migration. Do not edit an applied
  migration and do not drop columns until data has been backed up and consumers
  have been migrated.

## 4. Production hardening roadmap

Before storing real employee, approval, or financial data:

1. Add Supabase Auth and an `organization_members` role model.
2. Replace the `poc_*` RLS policies with per-organization/per-role policies.
3. Move audit events to append-only tables instead of editable JSON arrays.
4. Add separate Supabase projects for development, staging, and production.
5. Add migration tests and a staging deploy gate before production.
6. Add backups, retention rules, monitoring, and incident ownership.
