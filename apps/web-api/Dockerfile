# syntax=docker/dockerfile:1
#
# Production image for @medcal/web-api (Express public edge: captcha/rate-limit/forward
# only — zero database access, all persistence happens in @medcal/api).
# Built from the pnpm/Turborepo monorepo root — build context MUST be the repo root:
#   docker build -f apps/web-api/Dockerfile -t medcal-web-api .
# (docker-compose.prod.yml already sets context/dockerfile this way.)
#
# Runtime note: same constraint as apps/api/Dockerfile — web-api's workspace packages
# (@medcal/config, @medcal/notifications, @medcal/shared) are consumed as raw TypeScript
# ("main" points at src/index.ts, no per-package build step exists). Plain
# `node dist/index.js` (web-api's own "start" script) would hit the same
# ERR_MODULE_NOT_FOUND on extensionless workspace imports that apps/api's Dockerfile
# already had to work around. This image runs the app through tsx instead, for the
# identical reason — see apps/api/Dockerfile's own note and F5.2 in
# docs/Architecture/02-foundation-implementation-plan.md.
#
# Unlike apps/api, web-api has no Prisma/database dependency anywhere in its own code
# or its three workspace dependencies (verified by source inspection) — no
# `prisma generate` stage is needed here.

FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat openssl
RUN corepack enable

# ---- Prune the monorepo down to only what @medcal/web-api needs ----
FROM base AS pruner
WORKDIR /app
RUN npm install -g turbo@^2.5.0
COPY . .
RUN turbo prune @medcal/web-api --docker

# ---- Install pruned dependencies ----
FROM base AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .

# ---- Runtime image ----
FROM base AS runner
ENV NODE_ENV=production
RUN addgroup -S medcal && adduser -S medcal -G medcal
WORKDIR /app
COPY --from=installer /app .
USER medcal
WORKDIR /app/apps/web-api
EXPOSE 3002
CMD ["node_modules/.bin/tsx", "src/index.ts"]
