# Lalamove Clone — Next.js Delivery App

An on-demand delivery app (Lalamove clone) built with Next.js (App Router), Tailwind CSS v4, and Prisma, with an agentic (Claude Code) workflow pre-configured.

## What's included

- **`.claude/`** — Claude Code subagents (`coder`, `code-review`, `deep-dive`, `security-scanner`, `better-auth-expert`, `polar-payments-expert`) and 18 skills (`create-spec`, `implement-feature`, `checkpoint`, `ship-it`, `review-pr`, `nextjs`, `shadcn`, `frontend-design`, and more)
- **`.agents/`** — mirror of the skills for tools that read this location
- **`AGENTS.md` / `CLAUDE.md`** — workflow rules (plan with deep-dive agents, implement via sub-agents, always lint/typecheck/test)
- **`skills-lock.json`** — upstream sources for installed skills
- **Tooling** — TypeScript (strict), ESLint (flat config), Prettier, EditorConfig, Dependabot

## Getting started

```bash
nvm use            # Node 22
pnpm install
pnpm dev           # start the Next.js dev server at http://localhost:3000
pnpm check         # lint + typecheck
```

App Router pages live in `src/app`. The Prisma schema lives in `prisma/schema.prisma`
and the client singleton in `src/lib/prisma.ts`. Set `DATABASE_URL` in `.env` (copy
from `env.example`) to a Supabase Postgres connection string. Authentication uses
[Better Auth](https://better-auth.com) (email/password), so also set `BETTER_AUTH_SECRET`
(generate with `openssl rand -base64 32`) and `BETTER_AUTH_URL` (e.g. `http://localhost:3000`).
Then sync the schema with:

```bash
pnpm exec prisma db push   # push the Prisma schema to Supabase Postgres
```

## Local development: merchant subdomain

This app splits sign-in/sign-up/dashboard access by hostname once
`NEXT_PUBLIC_MERCHANT_HOST` is set (see `env.example`): the main domain
serves CLIENT accounts, and the merchant subdomain serves DRIVER/COMPANY
accounts, with fully isolated sessions between the two. To exercise this
locally:

1. Set `NEXT_PUBLIC_MERCHANT_HOST="merchant.localhost:3000"` in your local
   `.env` (copy it from `env.example` if you don't have one yet — it ships
   with the var blank, i.e. the split disabled by default).
2. Run `pnpm dev`.
3. Open `http://localhost:3000` for the client experience and
   `http://merchant.localhost:3000` for the merchant experience — no
   `/etc/hosts` edit needed in Chrome, Edge, or Firefox.
4. Safari on macOS does not reliably resolve `*.localhost` subdomains before
   macOS Tahoe. If you need to test in Safari, add this line to
   `/etc/hosts`: `127.0.0.1 merchant.localhost`.
5. Unset `NEXT_PUBLIC_MERCHANT_HOST` (or delete the line from `.env`) and
   restart `pnpm dev` to disable the split entirely and confirm the app
   reverts to its single-host behavior.

## Scripts

| Script              | What it does               |
| ------------------- | -------------------------- |
| `pnpm dev`          | Next.js dev server         |
| `pnpm build`        | Prisma generate + build    |
| `pnpm start`        | Serve the production build |
| `pnpm lint`         | ESLint over the project    |
| `pnpm typecheck`    | TypeScript `tsc --noEmit`  |
| `pnpm check`        | Lint + typecheck           |
| `pnpm format`       | Prettier write             |
| `pnpm format:check` | Prettier check             |
