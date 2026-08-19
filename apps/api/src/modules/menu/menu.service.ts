import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@medcal/db";
import type { Menu, MenuApplication, MembershipRole } from "@medcal/db";
import { hasPermission } from "@medcal/auth";

export interface MenuWriteInput {
  application: MenuApplication;
  code: string;
  parentId?: string | null;
  label: string;
  href?: string | null;
  icon?: string | null;
  order?: number;
  isGroup?: boolean;
  isActive?: boolean;
  viewResource?: string | null;
  viewAction?: string | null;
}

export type MenuUpdateInput = Partial<Omit<MenuWriteInput, "application">>;

export interface NavTreeNode {
  id: string;
  label: string;
  href: string | null;
  icon: string | null;
  children?: NavTreeNode[];
}

// Menu is navigation/config only. Visibility is always derived from the
// existing hasPermission(role, resource, action) catalog (@medcal/auth) —
// this service never stores or evaluates role grants itself.
@Injectable()
export class MenuService {
  async listAdmin(application?: MenuApplication): Promise<Menu[]> {
    return prisma.menu.findMany({
      where: application ? { application } : undefined,
      orderBy: [{ application: "asc" }, { parentId: "asc" }, { order: "asc" }],
    });
  }

  async findOne(id: string): Promise<Menu> {
    const menu = await prisma.menu.findUnique({ where: { id } });
    if (!menu) {
      throw new NotFoundException({ message: "Menu not found", code: "MENU_NOT_FOUND" });
    }
    return menu;
  }

  async create(input: MenuWriteInput, actorUserId: string): Promise<Menu> {
    const isGroup = input.isGroup ?? false;
    const href = isGroup ? null : input.href ?? null;
    const viewResource = isGroup ? null : input.viewResource ?? null;
    const viewAction = isGroup ? null : input.viewAction ?? null;
    this.assertLeafRequiredFields(isGroup, href, viewResource, viewAction);

    if (input.parentId) {
      await this.assertValidParent(input.parentId, input.application, null);
    }

    const order = input.order ?? (await this.nextSiblingOrder(input.application, input.parentId ?? null));
    await this.assertOrderAvailable(input.application, input.parentId ?? null, order, null);

    try {
      return await prisma.menu.create({
        data: {
          application: input.application,
          code: input.code,
          parentId: input.parentId ?? null,
          label: input.label,
          href,
          icon: input.icon ?? null,
          order,
          isGroup,
          isActive: input.isActive ?? true,
          viewResource,
          viewAction,
          createdByUserId: actorUserId,
          updatedByUserId: actorUserId,
        },
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException({
          message: "A menu with this code already exists for this application",
          code: "MENU_CODE_EXISTS",
        });
      }
      throw error;
    }
  }

  async update(id: string, input: MenuUpdateInput, actorUserId: string): Promise<Menu> {
    const existing = await this.findOne(id);
    const isGroup = input.isGroup ?? existing.isGroup;
    const href = isGroup ? null : input.href !== undefined ? input.href : existing.href;
    const viewResource = isGroup ? null : input.viewResource !== undefined ? input.viewResource : existing.viewResource;
    const viewAction = isGroup ? null : input.viewAction !== undefined ? input.viewAction : existing.viewAction;
    this.assertLeafRequiredFields(isGroup, href, viewResource, viewAction);

    if (!isGroup) {
      const childCount = await prisma.menu.count({ where: { parentId: id } });
      if (childCount > 0) {
        throw new BadRequestException({
          message: "Cannot convert a menu with children into a leaf",
          code: "MENU_LEAF_WITH_CHILDREN",
        });
      }
    }

    const nextParentId = input.parentId === undefined ? existing.parentId : input.parentId;
    if (nextParentId) {
      await this.assertValidParent(nextParentId, existing.application, id);
    }

    const nextOrder = input.order ?? existing.order;
    const parentChanged = input.parentId !== undefined && input.parentId !== existing.parentId;
    if (input.order !== undefined || parentChanged) {
      await this.assertOrderAvailable(existing.application, nextParentId, nextOrder, id);
    }

    try {
      return await prisma.menu.update({
        where: { id },
        data: {
          code: input.code ?? existing.code,
          parentId: nextParentId,
          label: input.label ?? existing.label,
          href,
          icon: input.icon !== undefined ? input.icon : existing.icon,
          order: nextOrder,
          isGroup,
          isActive: input.isActive ?? existing.isActive,
          viewResource,
          viewAction,
          updatedByUserId: actorUserId,
        },
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException({
          message: "A menu with this code already exists for this application",
          code: "MENU_CODE_EXISTS",
        });
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    const existing = await this.findOne(id);
    const childCount = await prisma.menu.count({ where: { parentId: id } });
    if (childCount > 0) {
      throw new BadRequestException({
        message: "Cannot delete a menu that still has children — delete or reparent them first",
        code: "MENU_HAS_CHILDREN",
      });
    }
    await prisma.menu.delete({ where: { id: existing.id } });
  }

  // Server-side permission-filtered nav tree for one application. A leaf is
  // kept iff active AND hasPermission(role, viewResource, viewAction); a
  // group is kept iff active AND it has at least one visible child. Groups
  // never carry their own permission — visibility only ever flows up from
  // real leaves, per the locked "ANY visible child -> parent visible" rule.
  async getNavTree(application: MenuApplication, role: MembershipRole): Promise<NavTreeNode[]> {
    const rows = await prisma.menu.findMany({
      where: { application },
      orderBy: { order: "asc" },
    });

    const byParent = new Map<string | null, Menu[]>();
    for (const row of rows) {
      const list = byParent.get(row.parentId) ?? [];
      list.push(row);
      byParent.set(row.parentId, list);
    }

    const build = (parentId: string | null): NavTreeNode[] => {
      const siblings = byParent.get(parentId) ?? [];
      const result: NavTreeNode[] = [];
      for (const row of siblings) {
        if (!row.isActive) continue;
        if (row.isGroup) {
          const children = build(row.id);
          if (children.length === 0) continue;
          result.push({ id: row.id, label: row.label, href: null, icon: row.icon, children });
        } else {
          if (!row.viewResource || !row.viewAction) continue;
          if (!hasPermission(role, row.viewResource as never, row.viewAction)) continue;
          result.push({ id: row.id, label: row.label, href: row.href, icon: row.icon });
        }
      }
      return result;
    };

    return build(null);
  }

  // ---- validation helpers ----

  private assertLeafRequiredFields(
    isGroup: boolean,
    href: string | null,
    viewResource: string | null,
    viewAction: string | null,
  ): void {
    if (isGroup) return;
    if (!href || !viewResource || !viewAction) {
      throw new BadRequestException({
        message: "A leaf menu requires href, viewResource, and viewAction",
        code: "MENU_LEAF_MISSING_FIELDS",
      });
    }
  }

  private async assertValidParent(
    parentId: string,
    application: MenuApplication,
    selfId: string | null,
  ): Promise<void> {
    if (parentId === selfId) {
      throw new BadRequestException({ message: "A menu cannot be its own parent", code: "MENU_SELF_PARENT" });
    }
    const parent = await prisma.menu.findUnique({ where: { id: parentId } });
    if (!parent) {
      throw new BadRequestException({ message: "Parent menu not found", code: "MENU_PARENT_NOT_FOUND" });
    }
    if (parent.application !== application) {
      throw new BadRequestException({
        message: "Parent menu must belong to the same application",
        code: "MENU_PARENT_APPLICATION_MISMATCH",
      });
    }
    if (!parent.isGroup) {
      throw new BadRequestException({ message: "Parent menu must be a group", code: "MENU_PARENT_NOT_GROUP" });
    }

    if (selfId) {
      let cursor: Menu | null = parent;
      const visited = new Set<string>();
      while (cursor) {
        if (cursor.id === selfId) {
          throw new BadRequestException({
            message: "Circular parent relationship detected",
            code: "MENU_CIRCULAR_PARENT",
          });
        }
        if (visited.has(cursor.id)) break;
        visited.add(cursor.id);
        cursor = cursor.parentId ? await prisma.menu.findUnique({ where: { id: cursor.parentId } }) : null;
      }
    }
  }

  private async nextSiblingOrder(application: MenuApplication, parentId: string | null): Promise<number> {
    const max = await prisma.menu.aggregate({
      where: { application, parentId },
      _max: { order: true },
    });
    return (max._max.order ?? -1) + 1;
  }

  private async assertOrderAvailable(
    application: MenuApplication,
    parentId: string | null,
    order: number,
    selfId: string | null,
  ): Promise<void> {
    const clashing = await prisma.menu.findFirst({
      where: {
        application,
        parentId,
        order,
        ...(selfId ? { id: { not: selfId } } : {}),
      },
    });
    if (clashing) {
      throw new ConflictException({
        message: "Another menu already occupies this order among its siblings",
        code: "MENU_ORDER_TAKEN",
      });
    }
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return Boolean(
      error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002",
    );
  }
}
