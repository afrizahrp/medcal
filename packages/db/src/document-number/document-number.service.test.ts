import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "../index";
import { DocumentNumberService } from "./document-number.service";
import { parseDocumentNumberYearMonth } from "./format-document-number";

const TEST_COMPANY_A = "TN1";
const TEST_COMPANY_B = "TN2";
const createdCompanyIds: string[] = [];

async function ensureTestCompany(id: string, name: string) {
  await prisma.company.upsert({
    where: { id },
    create: {
      id,
      name,
      status: "ACTIVE",
    },
    update: {},
  });
  if (!createdCompanyIds.includes(id)) {
    createdCompanyIds.push(id);
  }
}

async function cleanupSequences(companyId: string) {
  await prisma.documentNumberSequence.deleteMany({ where: { companyId } });
}

describe("DocumentNumberService.allocate", () => {
  beforeAll(async () => {
    await ensureTestCompany(TEST_COMPANY_A, "Number Test A");
    await ensureTestCompany(TEST_COMPANY_B, "Number Test B");
  });

  afterAll(async () => {
    for (const companyId of createdCompanyIds) {
      await prisma.documentNumberSequence.deleteMany({ where: { companyId } });
    }
    await prisma.company.deleteMany({
      where: { id: { in: createdCompanyIds } },
    });
  });

  it("allocates formatted numbers for supported document types", async () => {
    await cleanupSequences(TEST_COMPANY_A);
    const issuedAt = new Date("2026-08-15T08:00:00.000Z");

    const customerNumber = await prisma.$transaction((tx) =>
      DocumentNumberService.allocate({
        companyId: TEST_COMPANY_A,
        documentType: "CUSTOMER",
        issuedAt,
        tx,
      }),
    );

    expect(customerNumber).toBe("CUS/2026/08/00001");
  });

  it("resets sequence per year", async () => {
    await cleanupSequences(TEST_COMPANY_A);

    const dec2026 = new Date("2026-12-20T00:00:00.000Z");
    const jan2027 = new Date("2027-01-05T00:00:00.000Z");

    const last2026 = await prisma.$transaction((tx) =>
      DocumentNumberService.allocate({
        companyId: TEST_COMPANY_A,
        documentType: "QUOTATION",
        issuedAt: dec2026,
        tx,
      }),
    );

    const first2027 = await prisma.$transaction((tx) =>
      DocumentNumberService.allocate({
        companyId: TEST_COMPANY_A,
        documentType: "QUOTATION",
        issuedAt: jan2027,
        tx,
      }),
    );

    expect(last2026).toBe("QUO/2026/12/00001");
    expect(first2027).toBe("QUO/2027/01/00001");
  });

  it("does not reset sequence when month changes within the same year", async () => {
    await cleanupSequences(TEST_COMPANY_A);

    const aug2026 = new Date("2026-08-10T00:00:00.000Z");
    const sep2026 = new Date("2026-09-10T00:00:00.000Z");

    const first = await prisma.$transaction((tx) =>
      DocumentNumberService.allocate({
        companyId: TEST_COMPANY_A,
        documentType: "CALIBRATION_REQUEST",
        issuedAt: aug2026,
        tx,
      }),
    );

    const second = await prisma.$transaction((tx) =>
      DocumentNumberService.allocate({
        companyId: TEST_COMPANY_A,
        documentType: "CALIBRATION_REQUEST",
        issuedAt: sep2026,
        tx,
      }),
    );

    expect(first).toBe("CRQ/2026/08/00001");
    expect(second).toBe("CRQ/2026/09/00002");
  });

  it("isolates sequences per tenant", async () => {
    await cleanupSequences(TEST_COMPANY_A);
    await cleanupSequences(TEST_COMPANY_B);

    const issuedAt = new Date("2026-08-01T00:00:00.000Z");

    const [numberA, numberB] = await Promise.all([
      prisma.$transaction((tx) =>
        DocumentNumberService.allocate({
          companyId: TEST_COMPANY_A,
          documentType: "QUOTATION",
          issuedAt,
          tx,
        }),
      ),
      prisma.$transaction((tx) =>
        DocumentNumberService.allocate({
          companyId: TEST_COMPANY_B,
          documentType: "QUOTATION",
          issuedAt,
          tx,
        }),
      ),
    ]);

    expect(numberA).toBe("QUO/2026/08/00001");
    expect(numberB).toBe("QUO/2026/08/00001");
    expect(numberA).toBe(numberB);
  });

  it("allocates unique numbers under concurrent requests", async () => {
    await cleanupSequences(TEST_COMPANY_A);

    const issuedAt = new Date("2026-08-20T00:00:00.000Z");
    const parallelCount = 25;

    const numbers = await Promise.all(
      Array.from({ length: parallelCount }, () =>
        prisma.$transaction((tx) =>
          DocumentNumberService.allocate({
            companyId: TEST_COMPANY_A,
            documentType: "QUOTATION",
            issuedAt,
            tx,
          }),
        ),
      ),
    );

    expect(numbers).toHaveLength(parallelCount);
    expect(new Set(numbers).size).toBe(parallelCount);

    const sequences = numbers
      .map((value) => Number(value.split("/")[3]))
      .sort((a, b) => a - b);

    expect(sequences[0]).toBe(1);
    expect(sequences[sequences.length - 1]).toBe(parallelCount);
    expect(sequences).toEqual(
      Array.from({ length: parallelCount }, (_, index) => index + 1),
    );

    for (const number of numbers) {
      expect(parseDocumentNumberYearMonth(number)).toEqual({
        year: 2026,
        month: 8,
      });
    }
  });

  it("bootstraps from existing document numbers when sequence row is missing", async () => {
    await cleanupSequences(TEST_COMPANY_A);

    const issuedAt = new Date("2026-08-24T00:00:00.000Z");
    const legacyCustomer = await prisma.customer.create({
      data: {
        companyId: TEST_COMPANY_A,
        number: "CUS/2026/08/00001",
        name: "Legacy Customer",
      },
    });

    try {
      const nextNumber = await prisma.$transaction((tx) =>
        DocumentNumberService.allocate({
          companyId: TEST_COMPANY_A,
          documentType: "CUSTOMER",
          issuedAt,
          tx,
        }),
      );

      expect(nextNumber).toBe("CUS/2026/08/00002");
    } finally {
      await prisma.customer.delete({ where: { id: legacyCustomer.id } });
    }
  });
});
