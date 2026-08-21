# syntax=docker/dockerfile:1
#
# Production image for @medcal/portal (Next.js 16 App Router, Lead Management / internal
# management portal — host-header routed via src/proxy.ts, "apps."-prefixed hostname only
# for this deployment; "portal." client surface is not deployed in this pass).
# Built from the pnpm/Turborepo monorepo root — build context MUST be the repo root:
#   docker build -f apps/portal/Dockerfile \
#     --build-arg NEXT_PUBLIC_API_URL=https://api.kalibrasimedika.co.id \
#     -t medcal-portal .
# (docker-compose.prod.yml already sets context/dockerfile/build.args this way.)
#
# NEXT_PUBLIC_* client config is inlined into the client bundle by `next build`:
# - NEXT_PUBLIC_API_URL — Better Auth client baseURL, apiFetch base, management chat socket
# - NEXT_PUBLIC_FIREBASE_* / NEXT_PUBLIC_FIREBASE_VAPID_KEY — Firebase Web SDK + FCM
# Portal has no dependency on apps/web-api, Prisma, or reCAPTCHA anywhere in its source —
# confirmed by inspection, so none of those are wired into this image. Firebase Admin /
# service-account credentials must NEVER be passed into this image.
#
# No `output: "standalone"` is set in next.config.js — runs via `next start`, same as
# apps/web's image.

FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat openssl
RUN corepack enable

# ---- Prune the monorepo down to only what @medcal/portal needs ----
FROM base AS pruner
WORKDIR /app
RUN npm install -g turbo@^2.5.0
COPY . .
RUN turbo prune @medcal/portal --docker

# ---- Install pruned dependencies ----
FROM base AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .

# ---- Build (NEXT_PUBLIC_* must be visible to `next build` here) ----
FROM installer AS builder
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ARG NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID
ARG NEXT_PUBLIC_FIREBASE_VAPID_KEY
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY
ENV NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ENV NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID
ENV NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=$NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ENV NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ENV NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID
ENV NEXT_PUBLIC_FIREBASE_VAPID_KEY=$NEXT_PUBLIC_FIREBASE_VAPID_KEY
RUN pnpm --filter=@medcal/portal run build

# ---- Runtime image ----
FROM base AS runner
ENV NODE_ENV=production
RUN addgroup -S medcal && adduser -S medcal -G medcal
WORKDIR /app
COPY --from=builder /app .
RUN chown -R medcal:medcal /app
USER medcal
WORKDIR /app/apps/portal
EXPOSE 3003
CMD ["node_modules/.bin/next", "start", "-p", "3003"]
