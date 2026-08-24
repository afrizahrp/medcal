import { ConflictException } from "@nestjs/common";
import type { DocumentNumberTransactionClient } from "@medcal/db";
import { normalizeEmail } from "@medcal/shared";

type DbClient = DocumentNumberTransactionClient;

export async function assertNoDuplicateCustomerEmail(
  companyId: string,
  email: string,
  db: DbClient,
  excludeCustomerId?: string,
): Promise<void> {
  const normalized = normalizeEmail(email);
  const existing = await db.customerContact.findFirst({
    where: {
      companyId,
      email: { equals: normalized, mode: "insensitive" },
      ...(excludeCustomerId ? { customerId: { not: excludeCustomerId } } : {}),
    },
    select: { customerId: true },
  });
  if (existing) {
    throw new ConflictException({
      message: "A customer with this contact email already exists",
      code: "DUPLICATE_CUSTOMER_EMAIL",
      customerId: existing.customerId,
    });
  }
}

export async function assertNoDuplicateCustomerTaxId(
  companyId: string,
  taxId: string,
  db: DbClient,
  excludeCustomerId?: string,
): Promise<void> {
  const trimmed = taxId.trim();
  if (!trimmed) return;

  const existing = await db.customer.findFirst({
    where: {
      companyId,
      taxId: trimmed,
      ...(excludeCustomerId ? { id: { not: excludeCustomerId } } : {}),
    },
    select: { id: true },
  });
  if (existing) {
    throw new ConflictException({
      message: "A customer with this tax ID already exists",
      code: "DUPLICATE_CUSTOMER_TAX_ID",
      customerId: existing.id,
    });
  }
}
