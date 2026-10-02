import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "../index";
import { DOCUMENT_TYPE_PREFIX } from "./document-type-prefix";
import { DOCUMENT_TYPE_NUMBER_TABLE } from "./document-type-table";
import {
  DocumentNumberCollisionError,
  DocumentNumberSequenceExhaustedError,
  DocumentNumberService,
  MAX_COLLISION_ATTEMPTS,
  MAX_DOCUMENT_SEQUENCE,
  type DocumentNumberTransactionClient,
} from "./document-number.service";
import { BUSINESS_TIME_ZONE, parseDocumentNumberYearMonth } from "./format-document-number";

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

  it("ignores suffixed Child-style numbers (NNNNN-N) when bootstrapping the sequence", async () => {
    await cleanupSequences(TEST_COMPANY_A);

    const issuedAt = new Date("2026-08-24T00:00:00.000Z");
    const rows = await Promise.all(
      ["CUS/2026/08/00004", "CUS/2026/08/00009-1", "CUS/2026/08/00009-2"].map((number) =>
        prisma.customer.create({
          data: { companyId: TEST_COMPANY_A, number, name: `Suffix ${number}` },
        }),
      ),
    );

    try {
      // Without the numeric guard this CAST('00009-1' AS INTEGER) aborts the
      // allocation; with it, only the plain 00004 seeds the counter.
      const nextNumber = await prisma.$transaction((tx) =>
        DocumentNumberService.allocate({
          companyId: TEST_COMPANY_A,
          documentType: "CUSTOMER",
          issuedAt,
          tx,
        }),
      );
      expect(nextNumber).toBe("CUS/2026/08/00005");
    } finally {
      await prisma.customer.deleteMany({ where: { id: { in: rows.map((row) => row.id) } } });
    }
  });

  describe("Work Order SPK / WOL split", () => {
    const aug2026 = new Date("2026-08-15T08:00:00.000Z");
    const sep2026 = new Date("2026-09-15T08:00:00.000Z");
    const dec2026 = new Date("2026-12-20T08:00:00.000Z");
    const jan2027 = new Date("2027-01-05T08:00:00.000Z");

    const allocate = (
      companyId: string,
      documentType: "WORK_ORDER" | "WORK_ORDER_SEND_TO_LAB",
      issuedAt: Date,
    ) =>
      prisma.$transaction((tx) =>
        DocumentNumberService.allocate({ companyId, documentType, issuedAt, tx }),
      );

    it("has no WOS prefix and no WORK_ORDER_ON_SITE document type", () => {
      expect(Object.values(DOCUMENT_TYPE_PREFIX)).not.toContain("WOS");
      expect(DOCUMENT_TYPE_PREFIX).not.toHaveProperty("WORK_ORDER_ON_SITE");
      expect(DOCUMENT_TYPE_PREFIX.WORK_ORDER).toBe("SPK");
      expect(DOCUMENT_TYPE_PREFIX.WORK_ORDER_SEND_TO_LAB).toBe("WOL");
    });

    it("issues independent SPK and WOL sequences for the same company/year", async () => {
      await cleanupSequences(TEST_COMPANY_A);

      expect(await allocate(TEST_COMPANY_A, "WORK_ORDER", aug2026)).toBe(
        "SPK/2026/08/00001",
      );
      expect(await allocate(TEST_COMPANY_A, "WORK_ORDER_SEND_TO_LAB", aug2026)).toBe(
        "WOL/2026/08/00001",
      );
      expect(await allocate(TEST_COMPANY_A, "WORK_ORDER", aug2026)).toBe(
        "SPK/2026/08/00002",
      );
      expect(await allocate(TEST_COMPANY_A, "WORK_ORDER_SEND_TO_LAB", aug2026)).toBe(
        "WOL/2026/08/00002",
      );
    });

    it("does not reset the SPK sequence when the month changes", async () => {
      await cleanupSequences(TEST_COMPANY_A);

      expect(await allocate(TEST_COMPANY_A, "WORK_ORDER", aug2026)).toBe(
        "SPK/2026/08/00001",
      );
      expect(await allocate(TEST_COMPANY_A, "WORK_ORDER", sep2026)).toBe(
        "SPK/2026/09/00002",
      );
    });

    it("resets the SPK sequence on a new year", async () => {
      await cleanupSequences(TEST_COMPANY_A);

      expect(await allocate(TEST_COMPANY_A, "WORK_ORDER", dec2026)).toBe(
        "SPK/2026/12/00001",
      );
      expect(await allocate(TEST_COMPANY_A, "WORK_ORDER", jan2027)).toBe(
        "SPK/2027/01/00001",
      );
    });

    it("isolates the SPK sequence between companies", async () => {
      await cleanupSequences(TEST_COMPANY_A);
      await cleanupSequences(TEST_COMPANY_B);

      expect(await allocate(TEST_COMPANY_A, "WORK_ORDER", aug2026)).toBe(
        "SPK/2026/08/00001",
      );
      expect(await allocate(TEST_COMPANY_B, "WORK_ORDER", aug2026)).toBe(
        "SPK/2026/08/00001",
      );
    });

    it("starts SPK at 00001 even after WOL numbers exist for the year", async () => {
      await cleanupSequences(TEST_COMPANY_A);

      // Consume WOL/2026/08/00001..00003 first.
      await allocate(TEST_COMPANY_A, "WORK_ORDER_SEND_TO_LAB", aug2026);
      await allocate(TEST_COMPANY_A, "WORK_ORDER_SEND_TO_LAB", aug2026);
      await allocate(TEST_COMPANY_A, "WORK_ORDER_SEND_TO_LAB", aug2026);

      // The SPK counter is a separate DocumentNumberSequence row and is unaffected.
      expect(await allocate(TEST_COMPANY_A, "WORK_ORDER", aug2026)).toBe(
        "SPK/2026/08/00001",
      );
    });
  });

  describe("Kontrol Alat KAL sequence", () => {
    const sep2026 = new Date("2026-09-12T08:00:00.000Z");
    const jan2027 = new Date("2027-01-05T08:00:00.000Z");

    const allocateKal = (companyId: string, issuedAt: Date) =>
      prisma.$transaction((tx) =>
        DocumentNumberService.allocate({
          companyId,
          documentType: "KONTROL_ALAT",
          issuedAt,
          tx,
        }),
      );

    it("maps KONTROL_ALAT to prefix KAL and table KontrolAlat, not CER or WOL", async () => {
      expect(DOCUMENT_TYPE_PREFIX.KONTROL_ALAT).toBe("KAL");
      expect(DOCUMENT_TYPE_NUMBER_TABLE.KONTROL_ALAT).toBe("KontrolAlat");
      expect(DOCUMENT_TYPE_PREFIX.CERTIFICATE).toBe("CER");
      expect(DOCUMENT_TYPE_PREFIX.WORK_ORDER_SEND_TO_LAB).toBe("WOL");
    });

    it("issues KAL/YYYY/MM/NNNNN independently of WOL and CER", async () => {
      await cleanupSequences(TEST_COMPANY_A);

      const wol = await prisma.$transaction((tx) =>
        DocumentNumberService.allocate({
          companyId: TEST_COMPANY_A,
          documentType: "WORK_ORDER_SEND_TO_LAB",
          issuedAt: sep2026,
          tx,
        }),
      );
      const cer = await prisma.$transaction((tx) =>
        DocumentNumberService.allocate({
          companyId: TEST_COMPANY_A,
          documentType: "CERTIFICATE",
          issuedAt: sep2026,
          tx,
        }),
      );

      expect(wol).toBe("WOL/2026/09/00001");
      expect(cer).toBe("CER/2026/09/00001");
      expect(await allocateKal(TEST_COMPANY_A, sep2026)).toBe("KAL/2026/09/00001");
      expect(await allocateKal(TEST_COMPANY_A, sep2026)).toBe("KAL/2026/09/00002");
    });

    it("resets the KAL sequence on a new year", async () => {
      await cleanupSequences(TEST_COMPANY_A);
      expect(await allocateKal(TEST_COMPANY_A, sep2026)).toBe("KAL/2026/09/00001");
      expect(await allocateKal(TEST_COMPANY_A, jan2027)).toBe("KAL/2027/01/00001");
    });
  });

  describe("Generated certificate CRT sequence (Asia/Jakarta)", () => {
    const allocateCrt = (
      companyId: string,
      issuedAt: Date,
      opts: { skipExisting?: boolean } = {},
    ) =>
      prisma.$transaction((tx) =>
        DocumentNumberService.allocate({
          companyId,
          documentType: "CERTIFICATE_GENERATED",
          issuedAt,
          timeZone: BUSINESS_TIME_ZONE,
          skipExisting: opts.skipExisting ?? true,
          tx,
        }),
      );

    const cleanupCustomers = (companyId: string) =>
      prisma.customer.deleteMany({ where: { companyId } });

    it("maps CERTIFICATE_GENERATED to CRT / Certificate and leaves CERTIFICATE on CER", () => {
      expect(DOCUMENT_TYPE_PREFIX.CERTIFICATE_GENERATED).toBe("CRT");
      expect(DOCUMENT_TYPE_NUMBER_TABLE.CERTIFICATE_GENERATED).toBe("Certificate");
      expect(DOCUMENT_TYPE_PREFIX.CERTIFICATE).toBe("CER");
    });

    it("issues CRT/YYYY/MM/NNNNN, sequence continues across months and resets each year", async () => {
      await cleanupSequences(TEST_COMPANY_A);

      expect(await allocateCrt(TEST_COMPANY_A, new Date("2026-09-15T03:00:00.000Z"))).toBe(
        "CRT/2026/09/00001",
      );
      expect(await allocateCrt(TEST_COMPANY_A, new Date("2026-09-20T03:00:00.000Z"))).toBe(
        "CRT/2026/09/00002",
      );
      // 2026-09-30 17:30Z is already 2026-10-01 00:30 in Jakarta: the month follows
      // WIB and the sequence does NOT reset.
      expect(await allocateCrt(TEST_COMPANY_A, new Date("2026-09-30T17:30:00.000Z"))).toBe(
        "CRT/2026/10/00003",
      );
      // 2026-12-31 18:00Z is 2027-01-01 01:00 WIB: new year, counter restarts.
      expect(await allocateCrt(TEST_COMPANY_A, new Date("2026-12-31T18:00:00.000Z"))).toBe(
        "CRT/2027/01/00001",
      );
    });

    it("keeps using UTC for other document types (behaviour unchanged)", async () => {
      await cleanupSequences(TEST_COMPANY_A);
      const number = await prisma.$transaction((tx) =>
        DocumentNumberService.allocate({
          companyId: TEST_COMPANY_A,
          documentType: "QUOTATION",
          issuedAt: new Date("2026-12-31T18:00:00.000Z"),
          tx,
        }),
      );
      expect(number).toBe("QUO/2026/12/00001");
    });

    it("is independent of the legacy CER counter and scoped per company", async () => {
      await cleanupSequences(TEST_COMPANY_A);
      await cleanupSequences(TEST_COMPANY_B);
      const at = new Date("2026-09-15T03:00:00.000Z");

      const cer = await prisma.$transaction((tx) =>
        DocumentNumberService.allocate({
          companyId: TEST_COMPANY_A,
          documentType: "CERTIFICATE",
          issuedAt: at,
          tx,
        }),
      );
      expect(cer).toBe("CER/2026/09/00001");
      expect(await allocateCrt(TEST_COMPANY_A, at)).toBe("CRT/2026/09/00001");
      expect(await allocateCrt(TEST_COMPANY_B, at)).toBe("CRT/2026/09/00001");
    });

    it("does not corrupt the counter when the surrounding transaction fails", async () => {
      await cleanupSequences(TEST_COMPANY_A);
      const at = new Date("2026-09-15T03:00:00.000Z");

      await expect(
        prisma.$transaction(async (tx) => {
          await DocumentNumberService.allocate({
            companyId: TEST_COMPANY_A,
            documentType: "CERTIFICATE_GENERATED",
            issuedAt: at,
            timeZone: BUSINESS_TIME_ZONE,
            skipExisting: true,
            tx,
          });
          throw new Error("rollback");
        }),
      ).rejects.toThrow("rollback");

      expect(await allocateCrt(TEST_COMPANY_A, at)).toBe("CRT/2026/09/00001");
    });

    it("allocates unique numbers under concurrent issuance", async () => {
      await cleanupSequences(TEST_COMPANY_A);
      const at = new Date("2026-09-15T03:00:00.000Z");
      const count = 25;

      const numbers = await Promise.all(
        Array.from({ length: count }, () => allocateCrt(TEST_COMPANY_A, at)),
      );

      expect(new Set(numbers).size).toBe(count);
      expect(numbers.map((n) => Number(n.split("/")[3])).sort((a, b) => a - b)).toEqual(
        Array.from({ length: count }, (_, i) => i + 1),
      );
    });

    it("skipExisting: skips numbers that already exist instead of returning a poisoned one", async () => {
      await cleanupSequences(TEST_COMPANY_A);
      await cleanupCustomers(TEST_COMPANY_A);
      const at = new Date("2026-08-15T03:00:00.000Z");
      const allocateCus = (skipExisting: boolean) =>
        prisma.$transaction((tx) =>
          DocumentNumberService.allocate({
            companyId: TEST_COMPANY_A,
            documentType: "CUSTOMER",
            issuedAt: at,
            skipExisting,
            tx,
          }),
        );
      try {
        expect(await allocateCus(true)).toBe("CUS/2026/08/00001");
        // Rows the allocator did not produce, sitting exactly where the counter is heading.
        await prisma.customer.createMany({
          data: [
            { companyId: TEST_COMPANY_A, number: "CUS/2026/08/00002", name: "Foreign 2" },
            { companyId: TEST_COMPANY_A, number: "CUS/2026/08/00003", name: "Foreign 3" },
          ],
        });
        expect(await allocateCus(true)).toBe("CUS/2026/08/00004");
      } finally {
        await cleanupCustomers(TEST_COMPANY_A);
      }
    });

    it("skipExisting: self-heals across many contiguous collisions (more than the attempt bound) and the healed counter is committed", async () => {
      await cleanupSequences(TEST_COMPANY_A);
      await cleanupCustomers(TEST_COMPANY_A);
      const at = new Date("2026-08-15T03:00:00.000Z");
      const allocateCus = () =>
        prisma.$transaction((tx) =>
          DocumentNumberService.allocate({
            companyId: TEST_COMPANY_A,
            documentType: "CUSTOMER",
            issuedAt: at,
            skipExisting: true,
            tx,
          }),
        );
      try {
        expect(await allocateCus()).toBe("CUS/2026/08/00001");
        const contiguous = MAX_COLLISION_ATTEMPTS * 10;
        await prisma.customer.createMany({
          data: Array.from({ length: contiguous }, (_, i) => ({
            companyId: TEST_COMPANY_A,
            number: `CUS/2026/08/${String(i + 2).padStart(5, "0")}`,
            name: `Foreign ${i + 2}`,
          })),
        });
        // One collision -> one counter jump -> the next number is free.
        expect(await allocateCus()).toBe(`CUS/2026/08/${String(contiguous + 2).padStart(5, "0")}`);
        // The jump was committed: the counter is healed, not poisoned.
        expect(await allocateCus()).toBe(`CUS/2026/08/${String(contiguous + 3).padStart(5, "0")}`);
      } finally {
        await cleanupCustomers(TEST_COMPANY_A);
      }
    });

    it("skipExisting: collisions in another month of the same year are also skipped", async () => {
      await cleanupSequences(TEST_COMPANY_A);
      await cleanupCustomers(TEST_COMPANY_A);
      try {
        await prisma.customer.createMany({
          data: [
            { companyId: TEST_COMPANY_A, number: "CUS/2026/03/00001", name: "March 1" },
            { companyId: TEST_COMPANY_A, number: "CUS/2026/03/00002", name: "March 2" },
          ],
        });
        // Counter row does not exist yet: seeded past the strict max regardless of month.
        const number = await prisma.$transaction((tx) =>
          DocumentNumberService.allocate({
            companyId: TEST_COMPANY_A,
            documentType: "CUSTOMER",
            issuedAt: new Date("2026-08-15T03:00:00.000Z"),
            skipExisting: true,
            tx,
          }),
        );
        expect(number).toBe("CUS/2026/08/00003");
      } finally {
        await cleanupCustomers(TEST_COMPANY_A);
      }
    });

    it("skipExisting: stays bounded — gives up with DocumentNumberCollisionError after MAX_COLLISION_ATTEMPTS", async () => {
      let inserts = 0;
      const fakeTx = {
        $queryRaw: async (strings: TemplateStringsArray) => {
          const sql = strings.join("?");
          if (sql.includes("INSERT INTO")) return [{ lastSequence: ++inserts, prefix: "CUS" }];
          if (sql.includes("SELECT 1 AS found")) return [{ found: 1 }]; // every number "exists"
          return [{ max_seq: 0 }];
        },
        $executeRaw: async () => 0,
      } as unknown as DocumentNumberTransactionClient;

      await expect(
        DocumentNumberService.allocate({
          companyId: TEST_COMPANY_A,
          documentType: "CUSTOMER",
          issuedAt: new Date("2026-08-15T03:00:00.000Z"),
          skipExisting: true,
          tx: fakeTx,
        }),
      ).rejects.toBeInstanceOf(DocumentNumberCollisionError);
      expect(inserts).toBe(MAX_COLLISION_ATTEMPTS);
    });

    it("sequence boundary: 99999 is the last valid number; the next allocation throws the typed exhaustion error and leaves the counter at 99999", async () => {
      await cleanupSequences(TEST_COMPANY_A);
      await prisma.documentNumberSequence.create({
        data: {
          companyId: TEST_COMPANY_A,
          documentType: "CUSTOMER",
          prefix: "CUS",
          year: 2026,
          lastSequence: MAX_DOCUMENT_SEQUENCE - 1,
        },
      });
      const at = new Date("2026-08-15T03:00:00.000Z");
      const allocateCus = (skipExisting: boolean) =>
        prisma.$transaction((tx) =>
          DocumentNumberService.allocate({
            companyId: TEST_COMPANY_A,
            documentType: "CUSTOMER",
            issuedAt: at,
            skipExisting,
            tx,
          }),
        );

      expect(await allocateCus(false)).toBe("CUS/2026/08/99999");
      const err = await allocateCus(false).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(DocumentNumberSequenceExhaustedError);
      expect(err).toMatchObject({ documentType: "CUSTOMER", year: 2026 });
      // Same typed error on the guarded path, and no partial state was committed.
      await expect(allocateCus(true)).rejects.toBeInstanceOf(DocumentNumberSequenceExhaustedError);
      const seq = await prisma.documentNumberSequence.findFirstOrThrow({
        where: { companyId: TEST_COMPANY_A, documentType: "CUSTOMER", year: 2026 },
      });
      expect(seq.lastSequence).toBe(MAX_DOCUMENT_SEQUENCE);
    });

    it("sequence boundary: existing foreign numbers up to 99999 exhaust a fresh counter with the typed error", async () => {
      await cleanupSequences(TEST_COMPANY_A);
      await cleanupCustomers(TEST_COMPANY_A);
      try {
        await prisma.customer.create({
          data: { companyId: TEST_COMPANY_A, number: "CUS/2026/08/99999", name: "Last" },
        });
        await expect(
          prisma.$transaction((tx) =>
            DocumentNumberService.allocate({
              companyId: TEST_COMPANY_A,
              documentType: "CUSTOMER",
              issuedAt: new Date("2026-08-15T03:00:00.000Z"),
              skipExisting: true,
              tx,
            }),
          ),
        ).rejects.toBeInstanceOf(DocumentNumberSequenceExhaustedError);
      } finally {
        await cleanupCustomers(TEST_COMPANY_A);
      }
    });

    it("skipExisting: malformed / over-long foreign numbers cannot poison the first-use seed", async () => {
      await cleanupSequences(TEST_COMPANY_A);
      await cleanupCustomers(TEST_COMPANY_A);
      const at = new Date("2026-08-15T03:00:00.000Z");
      try {
        await prisma.customer.createMany({
          data: [
            { companyId: TEST_COMPANY_A, number: "CUS/2026/ABC", name: "Malformed" },
            { companyId: TEST_COMPANY_A, number: "CUS/2026/08/123456", name: "Too long" },
          ],
        });
        const number = await prisma.$transaction((tx) =>
          DocumentNumberService.allocate({
            companyId: TEST_COMPANY_A,
            documentType: "CUSTOMER",
            issuedAt: at,
            skipExisting: true,
            tx,
          }),
        );
        expect(number).toBe("CUS/2026/08/00001");
      } finally {
        await cleanupCustomers(TEST_COMPANY_A);
      }
    });
  });
});
