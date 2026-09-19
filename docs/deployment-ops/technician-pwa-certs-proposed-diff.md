-# --- Next.js build-time variables (apps/web, apps/portal) ----------------
+# --- Next.js build-time variables (apps/web, apps/portal, apps/tech-pwa) --
 # =========================================================================
 # NOT injected into any container's runtime environment — read only by
 # Compose's variable substitution for docker-compose.prod.yml's
-# web/portal `build.args`, and only actually consumed by `next build` itself
-# (baked into the client bundle). See docker-compose.prod.yml's top comment
-# for the --env-file requirement this depends on.
+# web/portal/tech-pwa `build.args`, and only actually consumed by `next build`
+# itself (baked into the client bundle — for tech-pwa this also includes its
+# dynamic /firebase-messaging-sw.js Route Handler, see that Dockerfile's
+# header comment). See docker-compose.prod.yml's top comment for the
+# --env-file requirement this depends on.