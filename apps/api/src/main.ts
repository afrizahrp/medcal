import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { IoAdapter } from "@nestjs/platform-socket.io";
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
  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen(port);
  console.log(`[api] Nest listening on :${port}`);
}

bootstrap();
