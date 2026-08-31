import { prisma } from "../index";

/**
 * The canonical singleton fixture company. Its id matches the dev/CI
 * `COMPANY_ID` ("PKM"), which a large part of the API test suite references
 * directly as `realCompanyId = "PKM"`. Recreated deterministically by the
 * Vitest global setup after every truncation so those suites have a stable
 * tenant to attach fixtures to. Device Management tests deliberately do NOT
 * use this — they create their own disposable companies.
 */
export const FIXTURE_COMPANY_ID = "PKM";

export async function seedTestFixtures(): Promise<void> {
  await prisma.company.upsert({
    where: { id: FIXTURE_COMPANY_ID },
    create: {
      id: FIXTURE_COMPANY_ID,
      name: "PT. Presisi Kalibrasi Medika (test fixture)",
      status: "ACTIVE",
    },
    update: { status: "ACTIVE" },
  });
}
