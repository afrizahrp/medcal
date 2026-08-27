/**
 * Seeds Tax master data for company PKM.
 * taxRate is stored as a fraction (0.11 = 11%) to match Decimal(5, 4)
 * and quotation total calculation (subtotal * taxRate).
 * Run manually: pnpm --filter @medcal/db run seed:taxes
 */
import { prisma } from "../src/index";

const COMPANY_ID = "PKM";

interface TaxSeedRow {
  taxCode: string;
  description: string;
  taxRate: number;
  isExclude: boolean;
}

const ROWS: TaxSeedRow[] = [
  { taxCode: "T0", description: "Non PPN", taxRate: 0, isExclude: false },
  { taxCode: "T1", description: "PPN 11%", taxRate: 0.11, isExclude: true },
  { taxCode: "T2", description: "PPN 11%", taxRate: 0.11, isExclude: false },
];

async function seedTaxes() {
  const company = await prisma.company.findUnique({
    where: { id: COMPANY_ID },
    select: { id: true },
  });
  if (!company) {
    throw new Error(`Company ${COMPANY_ID} not found. Seed company first.`);
  }

  for (const row of ROWS) {
    await prisma.tax.upsert({
      where: {
        companyId_taxCode: { companyId: COMPANY_ID, taxCode: row.taxCode },
      },
      create: {
        companyId: COMPANY_ID,
        taxCode: row.taxCode,
        description: row.description,
        taxRate: row.taxRate,
        isExclude: row.isExclude,
        isActive: true,
      },
      update: {
        description: row.description,
        taxRate: row.taxRate,
        isExclude: row.isExclude,
        isActive: true,
      },
    });
  }

  console.log(`[seed] ${ROWS.length} Tax rows upserted for company ${COMPANY_ID}.`);
  await prisma.$disconnect();
}

seedTaxes().catch((error) => {
  console.error("[seed] Failed:", error);
  process.exit(1);
});
