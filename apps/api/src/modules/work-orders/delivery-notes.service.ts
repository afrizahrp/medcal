import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { DocumentNumberService, Prisma, prisma } from "@medcal/db";
import {
  renderEquipmentDeliveryNotePdf,
  type DeliveryNotePdfResult,
} from "./equipment-delivery-note-pdf";

const deliveryNoteInclude = {
  items: { orderBy: { sortOrder: "asc" as const } },
} as const;

export type EquipmentDeliveryNoteWithItems = Prisma.EquipmentDeliveryNoteGetPayload<{
  include: typeof deliveryNoteInclude;
}>;

/**
 * "Surat Jalan Alat" — a delivery note for the PKM reference equipment carried
 * to a customer site. It is a DOCUMENT over the equipment already selected and
 * confirmed on the ON_SITE work order (WorkOrderEquipment); it never selects or
 * edits equipment itself. Exactly one per work order; issuance is idempotent and
 * a reprint reuses the same DLN number.
 */
@Injectable()
export class DeliveryNotesService {
  private async loadWorkOrder(companyId: string, workOrderId: string) {
    const workOrder = await prisma.workOrder.findFirst({
      where: { id: workOrderId, companyId },
      include: {
        customer: { select: { name: true, address: true } },
        equipment: {
          orderBy: { sortOrder: "asc" },
          include: {
            equipment: {
              select: {
                id: true,
                brand: true,
                model: true,
                serialNumber: true,
                equipmentType: { select: { name: true } },
              },
            },
          },
        },
        deliveryNote: { include: deliveryNoteInclude },
      },
    });
    if (!workOrder) {
      throw new NotFoundException({
        message: "Work order not found",
        code: "WORK_ORDER_NOT_FOUND",
      });
    }
    return workOrder;
  }

  /**
   * Issue the delivery note for an ON_SITE work order. Idempotent: if one
   * already exists it is returned unchanged (no new number is allocated).
   */
  async issue(companyId: string, workOrderId: string): Promise<EquipmentDeliveryNoteWithItems> {
    const workOrder = await this.loadWorkOrder(companyId, workOrderId);

    if (workOrder.deliveryNote) {
      return workOrder.deliveryNote;
    }
    if (workOrder.serviceMode !== "ON_SITE") {
      throw new BadRequestException({
        message: "A delivery note applies only to on-site work orders",
        code: "DELIVERY_NOTE_NOT_APPLICABLE_FOR_SEND_TO_LAB",
      });
    }
    if (workOrder.equipmentConfirmedAt === null) {
      throw new BadRequestException({
        message: "Confirm the equipment list before issuing the delivery note",
        code: "WORK_ORDER_EQUIPMENT_NOT_CONFIRMED",
      });
    }
    if (workOrder.equipment.length === 0) {
      throw new BadRequestException({
        message: "The work order has no equipment to deliver",
        code: "WORK_ORDER_EQUIPMENT_EMPTY",
      });
    }

    const issuedAt = workOrder.scheduledStart ?? new Date();

    try {
      return await prisma.$transaction(async (tx) => {
        const number = await DocumentNumberService.allocate({
          companyId,
          documentType: "EQUIPMENT_DELIVERY_NOTE",
          issuedAt: new Date(),
          tx,
        });

        return tx.equipmentDeliveryNote.create({
          data: {
            companyId,
            workOrderId,
            number,
            issuedAt,
            workOrderNumber: workOrder.number,
            customerName: workOrder.customer.name,
            customerAddress: workOrder.customer.address,
            locationText: workOrder.addressText ?? workOrder.customer.name,
            items: {
              create: workOrder.equipment.map((row) => ({
                equipmentId: row.equipmentId,
                equipmentName: row.equipment.equipmentType.name,
                brand: row.equipment.brand,
                model: row.equipment.model,
                serialNumber: row.equipment.serialNumber,
                sortOrder: row.sortOrder,
              })),
            },
          },
          include: deliveryNoteInclude,
        });
      });
    } catch (error) {
      // Concurrent issuance — the unique workOrderId lost the race. Return the
      // winner rather than a second number.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const existing = await prisma.equipmentDeliveryNote.findUnique({
          where: { workOrderId },
          include: deliveryNoteInclude,
        });
        if (existing) return existing;
      }
      throw error;
    }
  }

  async findOne(companyId: string, workOrderId: string): Promise<EquipmentDeliveryNoteWithItems> {
    const deliveryNote = await prisma.equipmentDeliveryNote.findFirst({
      where: { workOrderId, companyId },
      include: deliveryNoteInclude,
    });
    if (!deliveryNote) {
      throw new NotFoundException({
        message: "Delivery note has not been issued for this work order",
        code: "DELIVERY_NOTE_NOT_FOUND",
      });
    }
    return deliveryNote;
  }

  async buildPdf(companyId: string, workOrderId: string): Promise<DeliveryNotePdfResult> {
    const deliveryNote = await this.findOne(companyId, workOrderId);
    const company = await prisma.company.findFirst({ where: { id: companyId } });
    if (!company) {
      throw new NotFoundException({ message: "Company not found", code: "COMPANY_NOT_FOUND" });
    }
    return renderEquipmentDeliveryNotePdf({
      deliveryNote: {
        number: deliveryNote.number,
        issuedAt: deliveryNote.issuedAt,
        workOrderNumber: deliveryNote.workOrderNumber,
        customerName: deliveryNote.customerName,
        customerAddress: deliveryNote.customerAddress,
        locationText: deliveryNote.locationText,
        items: deliveryNote.items.map((item) => ({
          equipmentName: item.equipmentName,
          brand: item.brand,
          model: item.model,
          serialNumber: item.serialNumber,
          sortOrder: item.sortOrder,
        })),
      },
      company,
    });
  }
}
