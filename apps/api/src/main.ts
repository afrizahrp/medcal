import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { loadRolePermissionCache } from "@medcal/auth";
import { AppModule } from "./app.module";

function parseTrustedOrigins(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Better Auth handles its own raw body parsing on auth routes.
    bodyParser: false,
  });
  app.enableCors({
    origin: parseTrustedOrigins(process.env.TRUSTED_ORIGINS),
    credentials: true,
  });
  // Socket.IO rides the SAME HTTP server/port as REST (locked topology: no
  // separate WebSocket service, apps/api stays internal-only behind Nginx).
  app.useWebSocketAdapter(new IoAdapter(app));
  // RolePermission grants are DB-driven; hasPermission() reads a synchronous
  // in-memory cache so it never needs to await a DB round-trip per check.
  // Prime it before accepting traffic so no request ever sees an empty cache.
  await loadRolePermissionCache();
  // Defensive self-heal: picks up any RolePermission change made outside the
  // Permission Management API's own cache-refresh path (e.g. a manual DB
  // fix). Not required for correctness — the API refreshes the cache itself
  // after every write — just cheap insurance.
  setInterval(() => {
    void loadRolePermissionCache();
  }, 60_000);
  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen(port);
  console.log(`[api] Nest listening on :${port}`);
}

bootstrap();
