/**
 * Seeds an INITIAL Price List placeholder for every existing DeviceType, scoped
 * to company PKM (same convention as seed-taxes.ts).
 *
 * Each seeded row is an explicit "price not configured" placeholder:
 *
 *   unitPrice      = 0
 *   isActive       = false   <-- so resolveActivePriceListItem() ignores it and
 *                                 quotation generation still flags the line
 *                                 `pricePending` (BR-11). A `unitPrice = 0`
 *                                 that were ACTIVE would be resolved as a real
 *                                 free tariff — never do that.
 *   effectiveFrom  = 2026-01-01
 *   effectiveUntil = 2027-12-31
 *
 * Configuring a real tariff = an admin edits `unitPrice` and flips
 * `isActive = true` (Price List screen).
 *
 * Idempotent: safe to re-run. It NEVER overwrites a configured price
 * (`unitPrice > 0` or `isActive = true`) and never creates a duplicate for the
 * same (companyId, deviceTypeId, effectiveFrom).
 *
 * Run manually: pnpm --filter @medcal/db run seed:price-list-items
 */
import { Prisma, prisma } from "../src/index";

const COMPANY_ID = "PKM";
const EFFECTIVE_FROM = new Date("2026-01-01T00:00:00.000Z");
const EFFECTIVE_UNTIL = new Date("2027-12-31T00:00:00.000Z");
const PLACEHOLDER_NOTES = "seed placeholder — price not configured";

function isConfigured(row: { unitPrice: Prisma.Decimal; isActive: boolean }): boolean {
  return row.isActive || row.unitPrice.greaterThan(0);
}

async function seedPriceListItems() {
  const company = await prisma.company.findUnique({
    where: { id: COMPANY_ID },
    select: { id: true },
  });
  if (!company) {
    throw new Error(`Company ${COMPANY_ID} not found. Seed company first.`);
  }

  const deviceTypes = await prisma.deviceType.findMany({
    select: { id: true, code: true, name: true },
    orderBy: { name: "asc" },
  });

  const existingForCompany = await prisma.priceListItem.count({ where: { companyId: COMPANY_ID } });

  let created = 0;
  let reaffirmed = 0;
  let configuredPreserved = 0;

  for (const dt of deviceTypes) {
    // Any active tariff for this device type ⇒ already configured, leave it alone.
    const activeCount = await prisma.priceListItem.count({
      where: { companyId: COMPANY_ID, deviceTypeId: dt.id, isActive: true },
    });
    if (activeCount > 0) {
      configuredPreserved += 1;
      continue;
    }

    const atKey = await prisma.priceListItem.findUnique({
      where: {
        companyId_deviceTypeId_effectiveFrom: {
          companyId: COMPANY_ID,
          deviceTypeId: dt.id,
          effectiveFrom: EFFECTIVE_FROM,
        },
      },
    });

    if (!atKey) {
      await prisma.priceListItem.create({
        data: {
          companyId: COMPANY_ID,
          deviceTypeId: dt.id,
          unitPrice: new Prisma.Decimal(0),
          currency: "IDR",
          effectiveFrom: EFFECTIVE_FROM,
          effectiveUntil: EFFECTIVE_UNTIL,
          isActive: false,
          notes: PLACEHOLDER_NOTES,
        },
      });
      created += 1;
      continue;
    }

    if (isConfigured(atKey)) {
      // A real price was set at this exact effectiveFrom — preserve verbatim.
      configuredPreserved += 1;
      continue;
    }

    // Pristine placeholder already present — only re-affirm seed-owned window /
    // notes if they drifted; never touch unitPrice / isActive.
    const untilDrift =
      atKey.effectiveUntil === null ||
      atKey.effectiveUntil.getTime() !== EFFECTIVE_UNTIL.getTime();
    if (untilDrift || atKey.notes !== PLACEHOLDER_NOTES) {
      await prisma.priceListItem.update({
        where: { id: atKey.id },
        data: { effectiveUntil: EFFECTIVE_UNTIL, notes: PLACEHOLDER_NOTES },
      });
    }
    reaffirmed += 1;
  }

  const finalCount = await prisma.priceListItem.count({ where: { companyId: COMPANY_ID } });

  console.log("[seed:price-list-items] company                :", COMPANY_ID);
  console.log("[seed:price-list-items] DeviceType records     :", deviceTypes.length);
  console.log("[seed:price-list-items] PriceListItem before   :", existingForCompany);
  console.log("[seed:price-list-items] new placeholders created:", created);
  console.log("[seed:price-list-items] pristine placeholders reaffirmed/skipped:", reaffirmed);
  console.log("[seed:price-list-items] configured prices preserved:", configuredPreserved);
  console.log("[seed:price-list-items] PriceListItem after    :", finalCount);
}

seedPriceListItems()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
