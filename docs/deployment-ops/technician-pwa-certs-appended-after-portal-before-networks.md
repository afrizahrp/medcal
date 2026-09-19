  tech-pwa:
    build:
      context: .
      dockerfile: apps/tech-pwa/Dockerfile
      args:
        # NEXT_PUBLIC_* must be build args — Next.js inlines them at `next build`,
        # including into this app's dynamic /firebase-messaging-sw.js Route
        # Handler (see apps/tech-pwa/Dockerfile's header comment — that route is
        # NOT actually runtime-injected despite its own source comment).
        NEXT_PUBLIC_API_URL: ${NEXT_PUBLIC_API_URL}
        NEXT_PUBLIC_FIREBASE_API_KEY: ${NEXT_PUBLIC_FIREBASE_API_KEY}
        NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: ${NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN}
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: ${NEXT_PUBLIC_FIREBASE_PROJECT_ID}
        NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: ${NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET}
        NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: ${NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID}
        NEXT_PUBLIC_FIREBASE_APP_ID: ${NEXT_PUBLIC_FIREBASE_APP_ID}
        NEXT_PUBLIC_FIREBASE_VAPID_KEY: ${NEXT_PUBLIC_FIREBASE_VAPID_KEY}
    image: medcal-tech-pwa:latest
    container_name: medcal-tech-pwa
    restart: unless-stopped
    ports:
      - "127.0.0.1:3004:3004"
    networks:
      - medcal_net
    # No env_file: .env.production here (unlike api/web-api/portal) — confirmed
    # by grep that apps/tech-pwa/src has zero runtime (non-NEXT_PUBLIC_)
    # process.env reads. Every value it needs is already build-time inlined
    # above; there's nothing left for the container's runtime env to supply.
    #
    # No container-level dependency on api: tech-pwa's calls to apps/api
    # (apiFetch, FCM token register/revoke) originate from the visitor's
    # browser, not from this container — same reasoning as web/portal.
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1:3004/"]
      interval: 15s
      timeout: 5s
      retries: 5
      start_period: 10s