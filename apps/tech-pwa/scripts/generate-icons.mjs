#!/usr/bin/env node
/**
 * One-shot PWA icon generator. Composites public/short-logo.png (portrait,
 * transparent) onto square canvases. Re-run whenever the source logo changes;
 * output is committed to public/icons/ so the app never depends on this
 * script at build/runtime.
 */
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "..", "public");
const source = join(publicDir, "short-logo.png");
const outDir = join(publicDir, "icons");

const BACKGROUND = { r: 255, g: 255, b: 255, alpha: 1 };

async function squareIcon(size, logoFraction) {
  const logoHeight = Math.round(size * logoFraction);
  const logo = await sharp(source).resize({ height: logoHeight }).toBuffer();
  const logoMeta = await sharp(logo).metadata();
  const left = Math.round((size - (logoMeta.width ?? logoHeight)) / 2);
  const top = Math.round((size - logoHeight) / 2);

  return sharp({
    create: { width: size, height: size, channels: 4, background: BACKGROUND },
  })
    .composite([{ input: logo, left, top }])
    .png()
    .toBuffer();
}

async function main() {
  await mkdir(outDir, { recursive: true });

  const jobs = [
    { name: "icon-192.png", size: 192, fraction: 0.7 },
    { name: "icon-512.png", size: 512, fraction: 0.7 },
    // Maskable: content must stay inside the ~80% safe zone (OS may crop to a circle).
    { name: "icon-192-maskable.png", size: 192, fraction: 0.5 },
    { name: "icon-512-maskable.png", size: 512, fraction: 0.5 },
    // iOS ignores transparency and never masks apple-touch-icon.
    { name: "apple-touch-icon.png", size: 180, fraction: 0.7 },
  ];

  for (const job of jobs) {
    const buffer = await squareIcon(job.size, job.fraction);
    const outPath = join(outDir, job.name);
    await sharp(buffer).toFile(outPath);
    console.log(`wrote ${outPath}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
