# syntax=docker/dockerfile:1
#
# Production image for @medcal/web (Next.js 16 App Router, public marketing/lead-gen site).
# Built from the pnpm/Turborepo monorepo root — build context MUST be the repo root:
#   docker build -f apps/web/Dockerfile \
#     --build-arg NEXT_PUBLIC_API_URL=https://api.kalibrasimedika.co.id \
#     --build-arg NEXT_PUBLIC_WEB_API_URL=https://kalibrasimedika.co.id \
#     --build-arg NEXT_PUBLIC_RECAPTCHA_SITE_KEY=<production site key> \
#     -t medcal-web .
# (docker-compose.prod.yml already sets context/dockerfile/build.args this way.)
#
# NEXT_PUBLIC_WEB_API_URL is the BARE origin, no /public suffix — every call site in
# apps/web/src already appends "/public/..." itself. See .env.production.example's
# NEXT_PUBLIC_WEB_API_URL comment for the full explanation of this exact trap.
#
# NEXT_PUBLIC_* values are inlined into the client bundle by `next build` itself — they
# MUST be present as build ARGs (not just runtime env), or the browser bundle silently
# falls back to each variable's http://localhost:... default (verified: apps/web/src
# reads them via `process.env.NEXT_PUBLIC_* ?? "http://localhost:..."`). Setting them
# only at `docker run`/compose runtime would be too late.
#
# next.config.js has no `output: "standalone"` set, so this image ships the full
# node_modules + .next server output and runs via `next start`, not a standalone bundle.

FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat openssl
RUN corepack enable

# ---- Prune the monorepo down to only what @medcal/web needs ----
FROM base AS pruner
WORKDIR /app
RUN npm install -g turbo@^2.5.0
COPY . .
RUN turbo prune @medcal/web --docker

# ---- Install pruned dependencies ----
FROM base AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .

# ---- Build (NEXT_PUBLIC_* must be visible to `next build` here) ----
FROM installer AS builder
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WEB_API_URL
ARG NEXT_PUBLIC_RECAPTCHA_SITE_KEY
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_WEB_API_URL=$NEXT_PUBLIC_WEB_API_URL
ENV NEXT_PUBLIC_RECAPTCHA_SITE_KEY=$NEXT_PUBLIC_RECAPTCHA_SITE_KEY
RUN pnpm --filter=@medcal/web run build

# ---- Runtime image ----
FROM base AS runner
ENV NODE_ENV=production
RUN addgroup -S medcal && adduser -S medcal -G medcal
WORKDIR /app
COPY --from=builder /app .
# Next.js Image Optimization writes to .next/cache/images at runtime; without
# this chown the non-root `medcal` user hits EACCES on mkdir (portal's image
# already does the same).
RUN chown -R medcal:medcal /app
USER medcal
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["node_modules/.bin/next", "start", "-p", "3000"]
