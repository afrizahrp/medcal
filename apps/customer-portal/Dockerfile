# syntax=docker/dockerfile:1
#
# Production image for @medcal/customer-portal (Next.js 16 App Router,
# customer-facing portal — sign-in/registration + CustomerUserLink-gated
# authenticated area; no PWA/service worker, no FCM).
# Built from the pnpm/Turborepo monorepo root — build context MUST be the repo root:
#   docker build -f apps/customer-portal/Dockerfile \
#     --build-arg NEXT_PUBLIC_API_URL=https://api.kalibrasimedika.co.id \
#     -t medcal-customer-portal .
# (docker-compose.prod.yml already sets context/dockerfile/build.args this way.)
#
# NEXT_PUBLIC_API_URL is inlined into the client bundle by `next build` itself
# (Better Auth client baseURL via @medcal/auth, apiFetch base via @medcal/shared —
# both transpiled packages) — it MUST be present as a build ARG, not just
# runtime env, or the browser bundle falls back to each package's own
# localhost default. Setting it only at `docker run`/compose runtime would be
# too late.
#
# apps/customer-portal has no Firebase/FCM dependency, no PWA manifest or
# service worker, and reads no other environment variable anywhere in its
# source (confirmed by inspection — the only env value it needs flows in
# indirectly through @medcal/auth and @medcal/shared, both of which read only
# NEXT_PUBLIC_API_URL). Do not add Firebase build args or any other env here.
#
# No `output: "standalone"` is set in next.config.js — runs via `next start`,
# same as apps/web/apps/portal/apps/tech-pwa's images (full node_modules +
# .next server output, not a standalone bundle).

FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat openssl
RUN corepack enable

# ---- Prune the monorepo down to only what @medcal/customer-portal needs ----
FROM base AS pruner
WORKDIR /app
RUN npm install -g turbo@^2.5.0
COPY . .
RUN turbo prune @medcal/customer-portal --docker

# ---- Install pruned dependencies ----
FROM base AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .

# ---- Build (NEXT_PUBLIC_API_URL must be visible to `next build` here) ----
FROM installer AS builder
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN pnpm --filter=@medcal/customer-portal run build

# ---- Runtime image ----
FROM base AS runner
ENV NODE_ENV=production
RUN addgroup -S medcal && adduser -S medcal -G medcal
WORKDIR /app
COPY --from=builder /app .
RUN chown -R medcal:medcal /app
USER medcal
WORKDIR /app/apps/customer-portal
EXPOSE 3005
CMD ["node_modules/.bin/next", "start", "-p", "3005"]
