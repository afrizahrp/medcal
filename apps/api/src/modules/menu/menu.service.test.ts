import { randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@medcal/db";
import { MenuService } from "./menu.service";

const service = new MenuService();
const createdMenuIds: string[] = [];
const createdUserIds: string[] = [];
let actorUserId: string;

function uniqueCode(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

async function createMenu(overrides: Partial<Parameters<MenuService["create"]>[0]> = {}) {
  const menu = await service.create(
    {
      application: "TECHNICIAN",
      code: uniqueCode("test"),
      label: "Test Menu",
      href: "/test",
      viewResource: "lead",
      viewAction: "read",
      ...overrides,
    },
    actorUserId,
  );
  createdMenuIds.push(menu.id);
  return menu;
}

beforeAll(async () => {
  const user = await prisma.user.create({
    data: {
      email: `menu-test-${randomUUID().slice(0, 8)}@kalibrasimedika.co.id`,
      name: "Menu Test Actor",
      status: "ACTIVE",
    },
  });
  actorUserId = user.id;
  createdUserIds.push(user.id);
});

afterAll(async () => {
  // Children first (FK Restrict on parentId).
  await prisma.menu.deleteMany({ where: { id: { in: createdMenuIds } } }).catch(async () => {
    for (const id of [...createdMenuIds].reverse()) {
      await prisma.menu.delete({ where: { id } }).catch(() => {});
    }
  });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe("MenuService.create — leaf/group consistency", () => {
  it("creates a valid leaf with href + viewResource + viewAction", async () => {
    const menu = await createMenu();
    expect(menu.isGroup).toBe(false);
    expect(menu.href).toBe("/test");
  });

  it("rejects a leaf missing href/viewResource/viewAction", async () => {
    await expect(
      service.create(
        { application: "TECHNICIAN", code: uniqueCode("bad-leaf"), label: "Bad Leaf" },
        actorUserId,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("creates a group with href/viewResource/viewAction forced to null even if supplied", async () => {
    const group = await service.create(
      {
        application: "TECHNICIAN",
        code: uniqueCode("group"),
        label: "Group",
        isGroup: true,
        href: "/should-be-ignored",
        viewResource: "lead",
        viewAction: "read",
      },
      actorUserId,
    );
    createdMenuIds.push(group.id);
    expect(group.href).toBeNull();
    expect(group.viewResource).toBeNull();
    expect(group.viewAction).toBeNull();
  });
});

describe("MenuService.create — code uniqueness", () => {
  it("rejects duplicate code within the same application", async () => {
    const code = uniqueCode("dup");
    await createMenu({ code });

    await expect(createMenu({ code })).rejects.toBeInstanceOf(ConflictException);
  });

  it("allows the same code across different applications", async () => {
    const code = uniqueCode("cross-app");
    const a = await createMenu({ application: "TECHNICIAN", code });
    const b = await createMenu({ application: "CUSTOMER", code });
    expect(a.code).toBe(b.code);
    expect(a.application).not.toBe(b.application);
  });
});

describe("MenuService.create — parent validation", () => {
  it("rejects a parentId that does not exist", async () => {
    await expect(
      createMenu({ parentId: "non-existent-id" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects a parent in a different application", async () => {
    const group = await service.create(
      { application: "CUSTOMER", code: uniqueCode("group"), label: "Group", isGroup: true },
      actorUserId,
    );
    createdMenuIds.push(group.id);

    await expect(
      createMenu({ application: "TECHNICIAN", parentId: group.id }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects a parent that is not a group (leaf cannot have children)", async () => {
    const leaf = await createMenu();

    await expect(createMenu({ parentId: leaf.id })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("accepts a valid group parent in the same application", async () => {
    const group = await service.create(
      { application: "TECHNICIAN", code: uniqueCode("group"), label: "Group", isGroup: true },
      actorUserId,
    );
    createdMenuIds.push(group.id);

    const child = await createMenu({ parentId: group.id });
    expect(child.parentId).toBe(group.id);
  });
});

describe("MenuService.update — self/circular parenting", () => {
  it("rejects a menu being set as its own parent", async () => {
    const group = await service.create(
      { application: "TECHNICIAN", code: uniqueCode("group"), label: "Group", isGroup: true },
      actorUserId,
    );
    createdMenuIds.push(group.id);

    await expect(
      service.update(group.id, { parentId: group.id }, actorUserId),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects a circular parent chain (A -> B -> A)", async () => {
    const a = await service.create(
      { application: "TECHNICIAN", code: uniqueCode("a"), label: "A", isGroup: true },
      actorUserId,
    );
    createdMenuIds.push(a.id);
    const b = await service.create(
      { application: "TECHNICIAN", code: uniqueCode("b"), label: "B", isGroup: true, parentId: a.id },
      actorUserId,
    );
    createdMenuIds.push(b.id);

    await expect(
      service.update(a.id, { parentId: b.id }, actorUserId),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("MenuService.update — leaf/group transitions", () => {
  it("rejects converting a group with children into a leaf", async () => {
    const group = await service.create(
      { application: "TECHNICIAN", code: uniqueCode("group"), label: "Group", isGroup: true },
      actorUserId,
    );
    createdMenuIds.push(group.id);
    await createMenu({ parentId: group.id });

    await expect(
      service.update(group.id, { isGroup: false, href: "/x", viewResource: "lead", viewAction: "read" }, actorUserId),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("MenuService — ordering", () => {
  it("auto-assigns the next sibling order when omitted", async () => {
    const parentCode = uniqueCode("parent");
    const group = await service.create(
      { application: "TECHNICIAN", code: parentCode, label: "Parent", isGroup: true },
      actorUserId,
    );
    createdMenuIds.push(group.id);

    const first = await createMenu({ parentId: group.id, order: undefined });
    const second = await createMenu({ parentId: group.id, order: undefined });
    expect(second.order).toBeGreaterThan(first.order);
  });

  it("rejects an explicit order that collides with an existing sibling", async () => {
    const group = await service.create(
      { application: "TECHNICIAN", code: uniqueCode("group"), label: "Group", isGroup: true },
      actorUserId,
    );
    createdMenuIds.push(group.id);
    await createMenu({ parentId: group.id, order: 5 });

    await expect(createMenu({ parentId: group.id, order: 5 })).rejects.toBeInstanceOf(ConflictException);
  });
});

describe("MenuService.remove", () => {
  it("rejects deleting a menu that still has children", async () => {
    const group = await service.create(
      { application: "TECHNICIAN", code: uniqueCode("group"), label: "Group", isGroup: true },
      actorUserId,
    );
    createdMenuIds.push(group.id);
    await createMenu({ parentId: group.id });

    await expect(service.remove(group.id)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("deletes a leaf with no children", async () => {
    const menu = await createMenu();
    await service.remove(menu.id);
    createdMenuIds.splice(createdMenuIds.indexOf(menu.id), 1);

    await expect(service.findOne(menu.id)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("MenuService.getNavTree — permission-derived visibility", () => {
  it("includes a leaf when the role has the required permission", async () => {
    const application = "TECHNICIAN";
    const menu = await service.create(
      {
        application,
        code: uniqueCode("visible"),
        label: "Visible",
        href: "/visible",
        viewResource: "whitelist",
        viewAction: "manage",
      },
      actorUserId,
    );
    createdMenuIds.push(menu.id);

    const tree = await service.getNavTree(application, "SUPERADMIN");
    expect(tree.some((n) => n.id === menu.id)).toBe(true);
  });

  it("excludes a leaf when the role lacks the required permission", async () => {
    const application = "TECHNICIAN";
    const menu = await service.create(
      {
        application,
        code: uniqueCode("hidden"),
        label: "Hidden",
        href: "/hidden",
        viewResource: "whitelist",
        viewAction: "manage",
      },
      actorUserId,
    );
    createdMenuIds.push(menu.id);

    const tree = await service.getNavTree(application, "CUSTOMER");
    expect(tree.some((n) => n.id === menu.id)).toBe(false);
  });

  it("excludes a disabled leaf regardless of permission", async () => {
    const application = "TECHNICIAN";
    const menu = await service.create(
      {
        application,
        code: uniqueCode("disabled"),
        label: "Disabled",
        href: "/disabled",
        viewResource: "whitelist",
        viewAction: "manage",
        isActive: false,
      },
      actorUserId,
    );
    createdMenuIds.push(menu.id);

    const tree = await service.getNavTree(application, "SUPERADMIN");
    expect(tree.some((n) => n.id === menu.id)).toBe(false);
  });

  it("shows a group iff at least one child is visible, hides it when none are", async () => {
    const application = "TECHNICIAN";
    const group = await service.create(
      { application, code: uniqueCode("group"), label: "Group", isGroup: true },
      actorUserId,
    );
    createdMenuIds.push(group.id);
    const child = await service.create(
      {
        application,
        code: uniqueCode("child"),
        label: "Child",
        parentId: group.id,
        href: "/child",
        viewResource: "whitelist",
        viewAction: "manage",
      },
      actorUserId,
    );
    createdMenuIds.push(child.id);

    const superadminTree = await service.getNavTree(application, "SUPERADMIN");
    const groupNode = superadminTree.find((n) => n.id === group.id);
    expect(groupNode).toBeDefined();
    expect(groupNode?.children?.some((c) => c.id === child.id)).toBe(true);

    const customerTree = await service.getNavTree(application, "CUSTOMER");
    expect(customerTree.some((n) => n.id === group.id)).toBe(false);
  });

  it("hides all descendants when the parent group itself is disabled, regardless of their own state", async () => {
    const application = "TECHNICIAN";
    const group = await service.create(
      { application, code: uniqueCode("group"), label: "Group", isGroup: true, isActive: false },
      actorUserId,
    );
    createdMenuIds.push(group.id);
    const child = await service.create(
      {
        application,
        code: uniqueCode("child"),
        label: "Child",
        parentId: group.id,
        href: "/child",
        viewResource: "whitelist",
        viewAction: "manage",
      },
      actorUserId,
    );
    createdMenuIds.push(child.id);

    const tree = await service.getNavTree(application, "SUPERADMIN");
    expect(tree.some((n) => n.id === group.id)).toBe(false);
  });

  it("isolates applications — a MANAGEMENT-only code never appears in a TECHNICIAN or CUSTOMER tree", async () => {
    const code = uniqueCode("mgmt-only");
    const menu = await service.create(
      {
        application: "MANAGEMENT",
        code,
        label: "Mgmt Only",
        href: "/mgmt-only",
        viewResource: "menu",
        viewAction: "manage",
      },
      actorUserId,
    );
    createdMenuIds.push(menu.id);

    const technicianTree = await service.getNavTree("TECHNICIAN", "SUPERADMIN");
    const customerTree = await service.getNavTree("CUSTOMER", "SUPERADMIN");
    expect(technicianTree.some((n) => n.id === menu.id)).toBe(false);
    expect(customerTree.some((n) => n.id === menu.id)).toBe(false);

    const managementTree = await service.getNavTree("MANAGEMENT", "SUPERADMIN");
    expect(managementTree.some((n) => n.id === menu.id)).toBe(true);
  });
});
