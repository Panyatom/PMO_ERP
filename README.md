# PMO ERP

Static PMO proof of concept backed by Supabase. The repository now keeps the
database schema as migrations and injects browser configuration at deploy time.

## Local run

1. Copy `config.example.js` to `config.js` and fill in the Supabase URL and
   public anon key, or generate it from environment variables:

   ```powershell
   $env:SUPABASE_URL='https://<project-ref>.supabase.co'
   $env:SUPABASE_ANON_KEY='<anon-key>'
   node scripts/generate-config.mjs
   ```

2. Serve the folder through a local web server (do not open it directly as a
   `file://` URL).
3. Open `index.html` for the complete PMO Dashboard V0.2 application.

## Tests

Business-flow tests use the built-in Node.js test runner and do not require
external packages:

```powershell
npm test
```

For the current Resource workflow suite only:

```powershell
npm run test:resource-flow
```

## Database

The source of truth is `supabase/migrations/`. Apply migrations with the
Supabase CLI from a trusted workstation or CI environment. Never expose the
database password, access token, or `service_role` key in browser code.

```powershell
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push
```

The current policies deliberately retain anonymous read/create/update access
for PoC compatibility. The browser now has an auth-ready mock session facade so
UI and business-flow tests can use one role/session model before real OAuth is
enabled. This is not the final production authorization model; Supabase Auth
and organization-based RLS are the next security milestone.

## Deployment

GitHub Pages deploys `index.html` through `.github/workflows/deploy-pages.yml`.
Repository variables and rollout details are documented in
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
