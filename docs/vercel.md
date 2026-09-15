# Vercel portfolio edition

**Live demo:** [incidentgraph-six.vercel.app](https://incidentgraph-six.vercel.app)

The hosted edition lets recruiters explore the complete interface using deliberately synthetic telemetry. It includes incident creation, status changes, notes, root-cause analysis, graphs, search, logs, metrics, traces and environment filters.

Choose **Enter demo workspace** on the login page; the demo credentials are prefilled. Changes stay in the current browser tab, survive reloads and reset on sign out or when the tab session ends. There is a limit of 200 changes per session. Browser session storage must be available. A duplicated tab may inherit its initial session state through standard browser behavior; subsequent edits are independent. Other visitors do not see your changes. Use fictional notes only.

## What is deployed

Vercel hosts Next.js, fonts, assets and a browser-only portfolio adapter. The adapter uses the same query functions and deterministic root-cause engine as the full-stack implementation. It starts from code-defined fixtures and stores a bounded, validated edit history in `sessionStorage`. It never reads `.env`, private JSON snapshots, PostgreSQL or Redis. There is no telemetry API or ingestion endpoint in this edition.

The full-stack private workspace remains available through the standard local and Docker commands in the README. Its default-deny API guard, server-side sessions, CSRF protection and persistence are unchanged. The public demo entry marker is not an authentication system and must not be substituted for those controls.

## Reproduce the build

Use Node.js 24 and npm 11. Install from the repository root with `npm ci`, then run:

```sh
npm run build:portfolio -w @incidentgraph/web
npm run start -w @incidentgraph/web
```

The build script sets `NEXT_PUBLIC_PORTFOLIO_DEMO=true` for that build only. A normal `npm run build` produces the private API-connected edition again. Each build must use its matching output; do not switch a previously built bundle by changing runtime environment variables.

On Vercel, set the project Root Directory to `apps/web`, keep access to source outside that directory enabled for the npm workspace, and use the committed `apps/web/vercel.json`. It chooses the Next.js framework, installs the locked root workspace dependencies including TypeScript, and runs `npm run build:portfolio`. The project requires no database, API URL, administrator password or session secret. Use a separate project for a future private deployment.

For a reviewed CLI upload, `node infra/scripts/prepare-vercel.mjs` copies an explicit source allowlist into `.data/vercel/source`; `--verify` compares file hashes and rejects unexpected files. Deploy that repository-shaped directory with a Vercel project whose Root Directory is `apps/web`. Review source and run a secret scan before uploading. Do not upload the original working directory's environment files, local data or browser reports.

## Verification

`npm run test:e2e:portfolio` builds an isolated production server without starting NestJS. It checks all primary screens, accessibility, mobile overflow, telemetry navigation, safe rendering, persistence across reloads, visitor isolation, reset on logout and absence of API requests.

Set `PORTFOLIO_BASE_URL` to the deployed HTTPS URL to run the same suite against Vercel. The tests make only browser-local synthetic changes. Private API and PostgreSQL regression checks remain in the main CI workflow.
