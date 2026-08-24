import { Injectable, NotFoundException } from "@nestjs/common";
import { DocumentNumberService, prisma } from "@medcal/db";
import type { DocumentNumberTransactionClient, Prisma } from "@medcal/db";
import {
  CUSTOMER_SORTABLE_FIELDS,
  normalizeEmail,
  type CustomerCreateInput,
  type CustomerListQuery,
  type CustomerUpdateInput,
} from "@medcal/shared";
import { resolveSortOrder } from "../../common/sort-query";
import {
  assertNoDuplicateCustomerEmail,
  assertNoDuplicateCustomerTaxId,
} from "./customer-duplicate";

const DEFAULT_PAGE_SIZE = 10;

export type CustomerWithContacts = Prisma.CustomerGetPayload<{
  include: { contacts: true };
}>;

export interface CustomerListResult {
  data: CustomerWithContacts[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

@Injectable()
export class CustomersService {
  /**
   * Canonical Customer creation — used by manual POST /customers and Lead
   * conversion. When `tx` is supplied, all writes run in the caller's
   * transaction (required for atomic Lead conversion).
   */
  async createCustomer(
    companyId: string,
    input: CustomerCreateInput,
    tx?: DocumentNumberTransactionClient,
  ): Promise<CustomerWithContacts> {
    const run = async (db: DocumentNumberTransactionClient) => {
      if (input.contact?.email) {
        await assertNoDuplicateCustomerEmail(companyId, input.contact.email, db);
      }
      if (input.taxId) {
        await assertNoDuplicateCustomerTaxId(companyId, input.taxId, db);
      }

      const issuedAt = new Date();
      const number = await DocumentNumberService.allocate({
        companyId,
        documentType: "CUSTOMER",
        issuedAt,
        tx: db,
      });

      const customer = await db.customer.create({
        data: {
          companyId,
          number,
          name: input.name,
          legalName: input.legalName,
          taxId: input.taxId?.trim() || undefined,
          address: input.address,
        },
      });

      if (input.contact) {
        await db.customerContact.create({
          data: {
            companyId,
            customerId: customer.id,
            name: input.contact.name,
            email: input.contact.email ? normalizeEmail(input.contact.email) : undefined,
            phone: input.contact.phone,
            title: input.contact.title,
            isPrimary: true,
          },
        });
      }

      return db.customer.findFirstOrThrow({
        where: { id: customer.id, companyId },
        include: { contacts: true },
      });
    };

    if (tx) {
      return run(tx);
    }
    return prisma.$transaction(run);
  }

  async findAll(companyId: string, query: CustomerListQuery): Promise<CustomerListResult> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;

    const where: Prisma.CustomerWhereInput = {
      companyId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: "insensitive" } },
              { number: { contains: query.search, mode: "insensitive" } },
              { legalName: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const { field: sortField, dir: sortDir } = resolveSortOrder(
      CUSTOMER_SORTABLE_FIELDS,
      query.sortBy,
      query.sortDir,
      "createdAt",
    );

    const [total, data] = await Promise.all([
      prisma.customer.count({ where }),
      prisma.customer.findMany({
        where,
        orderBy: { [sortField]: sortDir },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { contacts: true },
      }),
    ]);

    return { data, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  async findOne(companyId: string, id: string): Promise<CustomerWithContacts> {
    const customer = await prisma.customer.findFirst({
      where: { id, companyId },
      include: { contacts: true },
    });
    if (!customer) {
      throw new NotFoundException({ message: "Customer not found", code: "CUSTOMER_NOT_FOUND" });
    }
    return customer;
  }

  async update(companyId: string, id: string, input: CustomerUpdateInput): Promise<CustomerWithContacts> {
    const existing = await prisma.customer.findFirst({ where: { id, companyId } });
    if (!existing) {
      throw new NotFoundException({ message: "Customer not found", code: "CUSTOMER_NOT_FOUND" });
    }

    if (input.taxId !== undefined && input.taxId !== null) {
      await assertNoDuplicateCustomerTaxId(companyId, input.taxId, prisma, id);
    }

    return prisma.$transaction(async (tx) => {
      await tx.customer.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.legalName !== undefined ? { legalName: input.legalName } : {}),
          ...(input.taxId !== undefined ? { taxId: input.taxId?.trim() || null } : {}),
          ...(input.address !== undefined ? { address: input.address } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
        },
      });

      if (input.contact) {
        if (input.contact.email) {
          await assertNoDuplicateCustomerEmail(companyId, input.contact.email, tx, id);
        }

        const primary = await tx.customerContact.findFirst({
          where: { customerId: id, companyId, isPrimary: true },
        });

        const contactData = {
          name: input.contact.name,
          email: input.contact.email ? normalizeEmail(input.contact.email) : null,
          phone: input.contact.phone?.trim() || null,
          title: input.contact.title?.trim() || null,
        };

        if (primary) {
          await tx.customerContact.update({
            where: { id: primary.id },
            data: contactData,
          });
        } else {
          await tx.customerContact.create({
            data: {
              companyId,
              customerId: id,
              ...contactData,
              isPrimary: true,
            },
          });
        }
      }

      return tx.customer.findFirstOrThrow({
        where: { id, companyId },
        include: { contacts: true },
      });
    });
  }
}
