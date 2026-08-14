# syntax=docker/dockerfile:1
#
# Production image for @medcal/api (NestJS: REST + WebSocket + Better Auth + RBAC).
# Built from the pnpm/Turborepo monorepo root — build context MUST be the repo root:
#   docker build -f apps/api/Dockerfile -t medcal-api .
# (docker-compose.prod.yml already sets context/dockerfile this way.)
#
# Runtime note: workspace packages (@medcal/db, @medcal/auth, @medcal/shared, ...) are
# consumed as raw TypeScript (package.json "main" points at src/index.ts, no per-package
# build step exists yet). Plain `node dist/main.js` cannot resolve those at runtime
# (verified: ERR_MODULE_NOT_FOUND on extensionless workspace imports). This image runs
# the app through tsx — the same tool already used for local dev — rather than adding a
# five-package build pipeline just for containerization. See F5.2 note in
# docs/Architecture/02-foundation-implementation-plan.md.

FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat openssl
RUN corepack enable

# ---- Prune the monorepo down to only what @medcal/api needs ----
FROM base AS pruner
WORKDIR /app
RUN npm install -g turbo@^2.5.0
COPY . .
RUN turbo prune @medcal/api --docker

# ---- Install pruned dependencies, generate the Prisma client for this platform ----
FROM base AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
# "native" binaryTargets (schema default) resolves against whatever platform this RUN
# executes on — running it here (Alpine/musl) produces the correct Linux engine, not the
# Windows one committed to a dev machine's local node_modules.
RUN pnpm --filter=@medcal/db run generate

# ---- Runtime image ----
FROM base AS runner
ENV NODE_ENV=production
RUN addgroup -S medcal && adduser -S medcal -G medcal
WORKDIR /app
COPY --from=installer /app .
USER medcal
WORKDIR /app/apps/api
EXPOSE 3001
CMD ["node_modules/.bin/tsx", "src/main.ts"]
