# Healthcare Claim Shield - Monorepo

Turborepo + pnpm workspace. Frontend (Next.js) in `apps/frontend`; backend can be added under `apps/backend`.

## Prerequisites

### Installing pnpm (macOS)

If pnpm isn’t installed, use one of these options:

**Option 1: Corepack**  
```bash
corepack enable
corepack prepare pnpm@latest --activate
```
Then run `pnpm --version` to confirm (you want pnpm 9+).

**Option 2: Homebrew**  
```bash
brew install pnpm
```

**Option 3: npm**  
```bash
npm install -g pnpm
```

After installation, run `pnpm --version` to confirm you have pnpm 9 or later.

## Commands (from repo root)

| Command | Description |
|---------|-------------|
| `pnpm install` | Install dependencies for all workspace packages |
| `pnpm dev` | Run all apps in dev mode (e.g. frontend only for now) |
| `pnpm dev --filter=frontend` | Run only the frontend app |
| `pnpm dev --filter=backend` | Run only the backend app (once added) |
| `pnpm build` | Build all apps |
| `pnpm lint` | Lint all apps |

## Adding the backend

1. Create `apps/backend/` with its own `package.json` (set `"name": "backend"`).
2. Add a `dev` script (e.g. `"dev": "node src/index.js"` or your server start command).
3. Run `pnpm dev --filter=backend` or `pnpm dev` to run with frontend.

## Structure

```
apps/
  frontend/   # Next.js (App Router, TypeScript, Tailwind)
  backend/    # (to be added by backend team)
packages/     # Optional shared packages (e.g. shared-types)
```
