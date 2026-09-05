-# apps/tech-pwa is intentionally not included yet — containerize it when its
-# own implementation reaches the appropriate stage (per F5.2 scope), not
-# merely for symmetry. apps/web-api, apps/web, and apps/portal are included
-# below, per the approved production topology:
+# apps/web-api, apps/web, apps/portal, and apps/tech-pwa are included below,
+# per the approved production topology:
 #   kalibrasimedika.co.id            -> web    (3000)
 #   kalibrasimedika.co.id/public/*   -> web-api (3002)
 #   api.kalibrasimedika.co.id        -> api     (3001)
 #   apps.kalibrasimedika.co.id       -> portal  (3003)
-# All four app containers are published to 127.0.0.1 only, never 0.0.0.0 —
+#   technician.kalibrasimedika.co.id -> tech-pwa (3004)
+# All five app containers are published to 127.0.0.1 only, never 0.0.0.0 —
 # reachable from Nginx on the same host, never directly from the Internet.