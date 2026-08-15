/**
 * One-off seed for ContactTopic — static, curated list, no admin CRUD.
 * Run manually: pnpm --filter @medcal/db run seed:contact-topics
 */
import { prisma } from "../src/index";

const TOPICS = [
  "Kalibrasi Monitoring Pasien",
  "Kalibrasi Respirasi & Life Support",
  "Kalibrasi Neonatal & Termal",
  "Kalibrasi Infus & Pompa Cairan",
  "Kalibrasi Blood Bank & Penyimpanan Suhu",
  "Kalibrasi Sterilisasi",
  "Kalibrasi Laboratorium & Diagnostik",
  "Kalibrasi Fasilitas Umum Rumah Sakit",
  "Lainnya / Informasi Umum",
];

async function seedContactTopics() {
  for (const name of TOPICS) {
    await prisma.contactTopic.upsert({
      where: { name },
      create: { name, isActive: true },
      update: { isActive: true },
    });
  }
  console.log(`[seed] ${TOPICS.length} ContactTopic rows upserted.`);
  await prisma.$disconnect();
}

seedContactTopics().catch((error) => {
  console.error("[seed] Failed:", error);
  process.exit(1);
});
