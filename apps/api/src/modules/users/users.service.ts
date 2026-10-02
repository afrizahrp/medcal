import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, prisma } from "@medcal/db";
import type { MembershipRole, User, UserMembership, UserStatus } from "@medcal/db";
import { isAllowedRegistrationDomain, normalizeEmail } from "@medcal/shared";
import { resolveOrderBy } from "../../common/sort-query";

/** Whitelisted `sortBy` values for GET /users — see resolveOrderBy. */
export const USER_SORTABLE_FIELDS = ["createdAt", "name", "email", "status"] as const;

// Internal staff roles (everything except CUSTOMER/SUPERADMIN) may only be
// granted to users on the approved company domain — see forensic audit
// "Customer vs Internal Staff Registration Discriminator". Reuses the same
// domain policy signup already enforces (isAllowedRegistrationDomain);
// deliberately not a stored flag, since email is already the source of
// truth and a flag could drift out of sync with it.
const INTERNAL_STAFF_DOMAIN_ERROR = {
  message: "Internal staff roles require a @kalibrasimedika.co.id email address",
  code: "INTERNAL_STAFF_DOMAIN_REQUIRED",
};

const CUSTOMER_EMAIL_MISMATCH_ERROR = {
  message: "The user's email does not match the selected Customer's PIC Email",
  code: "CUSTOMER_EMAIL_MISMATCH",
};

const CUSTOMER_ALREADY_HAS_PORTAL_USER_ERROR = {
  message: "This Customer already has an approved Customer Portal user",
  code: "CUSTOMER_ALREADY_HAS_PORTAL_USER",
};

const DEFAULT_PAGE_SIZE = 10;

/**
 * Customer Portal eligibility: the user's email equals Customer.email (the
 * PIC Email). CustomerContact.email is deliberately never consulted. Being
 * eligible only lets staff approve; it grants no access by itself.
 */
export function isCustomerPortalEligible(userEmail: string, customerEmail: string | null): boolean {
  if (!customerEmail || !customerEmail.trim()) return false;
  return normalizeEmail(userEmail) === normalizeEmail(customerEmail);
}

export interface EligibleCustomer {
  id: string;
  number: string;
  name: string;
  email: string;
  /** True when another portal user is already approved for this Customer. */
  hasPortalUser: boolean;
}

export type UserWithMembership = Prisma.UserGetPayload<{
  include: { memberships: { where: { companyId: string } } };
}>;

export interface UserListRow {
  id: string;
  email: string;
  name: string | null;
  status: UserStatus;
  membership: {
    role: MembershipRole;
    isDefault: boolean;
    receiveNotifications: boolean;
  } | null;
  createdAt: Date;
}

export interface UserListResult {
  data: UserListRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface UserListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  status?: UserStatus;
  role?: MembershipRole;
}

@Injectable()
export class UsersService {
  async findAll(companyId: string, query: UserListQuery): Promise<UserListResult> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;

    const where: Prisma.UserWhereInput = {
      memberships: { some: { companyId } },
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: "insensitive" } },
              { email: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(query.role ? { memberships: { some: { companyId, role: query.role } } } : {}),
    };

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: resolveOrderBy(USER_SORTABLE_FIELDS, query.sortBy, query.sortDir, "createdAt"),
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          memberships: { where: { companyId } },
        },
      }),
    ]);

    const data: UserListRow[] = users.map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      status: user.status,
      membership: user.memberships[0]
        ? {
            role: user.memberships[0].role,
            isDefault: user.memberships[0].isDefault,
            receiveNotifications: user.memberships[0].receiveNotifications,
          }
        : null,
      createdAt: user.createdAt,
    }));

    return { data, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  async findOne(companyId: string, userId: string): Promise<UserListRow> {
    const user = await prisma.user.findFirst({
      where: {
        id: userId,
        memberships: { some: { companyId } },
      },
      include: {
        memberships: { where: { companyId } },
      },
    });

    if (!user) {
      throw new NotFoundException({ message: "User not found", code: "USER_NOT_FOUND" });
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      status: user.status,
      membership: user.memberships[0]
        ? {
            role: user.memberships[0].role,
            isDefault: user.memberships[0].isDefault,
            receiveNotifications: user.memberships[0].receiveNotifications,
          }
        : null,
      createdAt: user.createdAt,
    };
  }

  async updateStatus(companyId: string, userId: string, status: UserStatus): Promise<User> {
    const user = await prisma.user.findFirst({
      where: {
        id: userId,
        memberships: { some: { companyId } },
      },
      include: { memberships: { where: { companyId } } },
    });

    if (!user) {
      throw new NotFoundException({ message: "User not found", code: "USER_NOT_FOUND" });
    }

    // F2: cannot DISABLED the last ACTIVE SUPERADMIN in this company.
    if (status === "DISABLED" && user.status === "ACTIVE") {
      const membership = user.memberships[0];
      if (membership?.role === "SUPERADMIN") {
        const activeSuperadminCount = await prisma.user.count({
          where: {
            status: "ACTIVE",
            memberships: { some: { companyId, role: "SUPERADMIN" } },
          },
        });
        if (activeSuperadminCount <= 1) {
          throw new ForbiddenException({
            message: "Cannot disable the last ACTIVE SUPERADMIN",
            code: "LAST_SUPERADMIN_PROTECTED",
          });
        }
      }
    }

    return prisma.user.update({
      where: { id: userId },
      data: { status },
    });
  }

  /**
   * Customers whose Customer.email (PIC Email) equals this user's email. The
   * same email may match several Customers; staff pick which one the user is
   * approved for.
   */
  async findEligibleCustomers(companyId: string, userId: string): Promise<EligibleCustomer[]> {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!user) {
      throw new NotFoundException({ message: "User not found", code: "USER_NOT_FOUND" });
    }
    const customers = await prisma.customer.findMany({
      where: { companyId, email: { equals: normalizeEmail(user.email), mode: "insensitive" } },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: { id: true, number: true, name: true, email: true, userLinks: { select: { userId: true } } },
    });
    return customers.map((customer) => ({
      id: customer.id,
      number: customer.number,
      name: customer.name,
      email: customer.email ?? "",
      hasPortalUser: customer.userLinks.some((link) => link.userId !== userId),
    }));
  }

  async assignMembership(
    companyId: string,
    userId: string,
    role: MembershipRole,
    customerId?: string,
  ): Promise<UserMembership> {
    if (role === "SUPERADMIN") {
      throw new ForbiddenException({
        message: "SUPERADMIN can only be created via bootstrap CLI",
        code: "SUPERADMIN_BOOTSTRAP_ONLY",
      });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException({ message: "User not found", code: "USER_NOT_FOUND" });
    }

    if (role !== "CUSTOMER" && !isAllowedRegistrationDomain(user.email)) {
      throw new ForbiddenException(INTERNAL_STAFF_DOMAIN_ERROR);
    }

    const existingMembership = await prisma.userMembership.findUnique({
      where: { userId_companyId: { userId, companyId } },
    });

    if (existingMembership) {
      throw new BadRequestException({
        message: "User already has a membership in this company",
        code: "MEMBERSHIP_EXISTS",
      });
    }

    // Customer Portal authorization foundation: approving a CUSTOMER
    // membership must also establish User -> CustomerUserLink -> Customer.
    // The Customer is never inferred from email/company name — staff must
    // explicitly select it, and it's validated here (server-side, tenant-
    // scoped) rather than trusted from the client.
    if (role === "CUSTOMER") {
      if (!customerId) {
        throw new BadRequestException({
          message: "customerId is required when assigning the CUSTOMER role",
          code: "CUSTOMER_ID_REQUIRED",
        });
      }
      const customer = await prisma.customer.findFirst({
        where: { id: customerId, companyId },
      });
      if (!customer) {
        throw new NotFoundException({ message: "Customer not found", code: "CUSTOMER_NOT_FOUND" });
      }
      // Eligibility is re-derived here from the stored emails; the client's
      // selection is never trusted. Customer.email only — not the contact's.
      if (!isCustomerPortalEligible(user.email, customer.email)) {
        throw new BadRequestException(CUSTOMER_EMAIL_MISMATCH_ERROR);
      }
    }

    return prisma.$transaction(async (tx) => {
      if (role === "CUSTOMER" && customerId) {
        // One Customer, at most one approved portal user. The unique index on
        // CustomerUserLink.customerId is the backstop for a concurrent approval.
        const occupied = await tx.customerUserLink.findFirst({
          where: { customerId, userId: { not: userId } },
          select: { id: true },
        });
        if (occupied) {
          throw new ConflictException(CUSTOMER_ALREADY_HAS_PORTAL_USER_ERROR);
        }
      }
      const membership = await tx.userMembership.create({
        data: { userId, companyId, role, isDefault: false },
      });
      // G5: provisioning = membership + ACTIVE. Do not silently re-enable DISABLED.
      if (user.status === "INVITED") {
        await tx.user.update({
          where: { id: userId },
          data: { status: "ACTIVE" },
        });
      }
      if (role === "CUSTOMER" && customerId) {
        // upsert: idempotent if this exact User<->Customer link already
        // exists (e.g. membership was previously removed and re-approved
        // against the same Customer) — the unique constraint is on
        // [userId, customerId], not scoped to this membership's lifecycle.
        try {
          await tx.customerUserLink.upsert({
            where: { userId_customerId: { userId, customerId } },
            create: { userId, customerId },
            update: {},
          });
        } catch (err) {
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
            throw new ConflictException(CUSTOMER_ALREADY_HAS_PORTAL_USER_ERROR);
          }
          throw err;
        }
      }
      return membership;
    });
  }

  async updateMembershipRole(
    companyId: string,
    userId: string,
    role: MembershipRole,
  ): Promise<UserMembership> {
    if (role === "SUPERADMIN") {
      throw new ForbiddenException({
        message: "SUPERADMIN can only be created via bootstrap CLI",
        code: "SUPERADMIN_BOOTSTRAP_ONLY",
      });
    }

    const membership = await prisma.userMembership.findUnique({
      where: { userId_companyId: { userId, companyId } },
      include: { user: { select: { email: true } } },
    });

    if (!membership) {
      throw new NotFoundException({
        message: "User membership not found",
        code: "MEMBERSHIP_NOT_FOUND",
      });
    }

    if (membership.role === "SUPERADMIN") {
      throw new ForbiddenException({
        message: "Cannot change SUPERADMIN role via API",
        code: "SUPERADMIN_PROTECTED",
      });
    }

    if (role !== "CUSTOMER" && !isAllowedRegistrationDomain(membership.user.email)) {
      throw new ForbiddenException(INTERNAL_STAFF_DOMAIN_ERROR);
    }

    // Leaving the CUSTOMER role ends the Customer Portal authorization too:
    // the link is the access record, so it must not outlive the role.
    return prisma.$transaction(async (tx) => {
      if (role !== "CUSTOMER") {
        await tx.customerUserLink.deleteMany({ where: { userId, customer: { companyId } } });
      }
      return tx.userMembership.update({
        where: { userId_companyId: { userId, companyId } },
        data: { role },
      });
    });
  }

  async updateMembershipNotificationSettings(
    companyId: string,
    userId: string,
    receiveNotifications: boolean,
  ): Promise<UserMembership> {
    const membership = await prisma.userMembership.findUnique({
      where: { userId_companyId: { userId, companyId } },
    });

    if (!membership) {
      throw new NotFoundException({
        message: "User membership not found",
        code: "MEMBERSHIP_NOT_FOUND",
      });
    }

    return prisma.userMembership.update({
      where: { userId_companyId: { userId, companyId } },
      data: { receiveNotifications },
    });
  }

  async removeMembership(companyId: string, userId: string): Promise<void> {
    const membership = await prisma.userMembership.findUnique({
      where: { userId_companyId: { userId, companyId } },
    });

    if (!membership) {
      throw new NotFoundException({
        message: "User membership not found",
        code: "MEMBERSHIP_NOT_FOUND",
      });
    }

    if (membership.role === "SUPERADMIN") {
      throw new ForbiddenException({
        message: "Cannot remove SUPERADMIN membership via API",
        code: "SUPERADMIN_PROTECTED",
      });
    }

    // Revoking access also frees the Customer for another portal user.
    await prisma.$transaction([
      prisma.customerUserLink.deleteMany({ where: { userId, customer: { companyId } } }),
      prisma.userMembership.delete({ where: { userId_companyId: { userId, companyId } } }),
    ]);
  }

  async findUsersWithoutMembership(
    companyId: string,
  ): Promise<Array<{ id: string; email: string; name: string | null }>> {
    const users = await prisma.user.findMany({
      where: {
        memberships: { none: { companyId } },
      },
      select: { id: true, email: true, name: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return users;
  }
}
