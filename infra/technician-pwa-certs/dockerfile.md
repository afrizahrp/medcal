# syntax=docker/dockerfile:1
#
# Production image for @medcal/tech-pwa (Next.js 16 App Router, Technician PWA —
# mobile-first job list/detail, AKD/AKL escalation, Identity Correction submit
# wizard with camera capture, Reference Equipment Used recording; installable
# PWA with an offline app-shell service worker).
# Built from the pnpm/Turborepo monorepo root — build context MUST be the repo root:
#   docker build -f apps/tech-pwa/Dockerfile \
#     --build-arg NEXT_PUBLIC_API_URL=https://api.kalibrasimedika.co.id \
#     -t medcal-tech-pwa .
# (docker-compose.prod.yml already sets context/dockerfile/build.args this way.)
#
# NEXT_PUBLIC_* client config is inlined into the client bundle by `next build` —
# and ALSO into this app's dynamic /firebase-messaging-sw.js Route Handler
# (src/app/firebase-messaging-sw.js/route.ts): despite that file's own comment
# claiming the values are "injected at runtime", Next.js's build replaces
# process.env.NEXT_PUBLIC_* literals in every compiled output (server route
# handlers included), not only client bundles — there is no actual runtime
# injection path for this route today. So these must be supplied as build
# args here, exactly like the client config.
# - NEXT_PUBLIC_API_URL — apiFetch base (@medcal/shared), FCM token revoke call
# - NEXT_PUBLIC_FIREBASE_* / NEXT_PUBLIC_FIREBASE_VAPID_KEY — Firebase Web SDK + FCM
#   (same Firebase project/app as apps/portal — one shared NEXT_PUBLIC_FIREBASE_*
#   block in .env.production.example, no tech-pwa-specific app id)
# tech-pwa has no dependency on apps/web-api, Prisma/@medcal/db, or reCAPTCHA
# anywhere in its source — confirmed by inspection. Firebase Admin /
# service-account credentials must NEVER be passed into this image.
#
# No `output: "standalone"` is set in next.config.js — runs via `next start`,
# same as apps/web and apps/portal's images.

FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat openssl
RUN corepack enable

# ---- Prune the monorepo down to only what @medcal/tech-pwa needs ----
FROM base AS pruner
WORKDIR /app
RUN npm install -g turbo@^2.5.0
COPY . .
RUN turbo prune @medcal/tech-pwa --docker

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
RUN pnpm --filter=@medcal/tech-pwa run build

# ---- Runtime image ----
FROM base AS runner
ENV NODE_ENV=production
RUN addgroup -S medcal && adduser -S medcal -G medcal
WORKDIR /app
COPY --from=builder /app .
RUN chown -R medcal:medcal /app
USER medcal
WORKDIR /app/apps/tech-pwa
EXPOSE 3004
CMD ["node_modules/.bin/next", "start", "-p", "3004"]