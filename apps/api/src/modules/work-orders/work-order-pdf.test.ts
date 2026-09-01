import { describe, expect, it } from "vitest";
import type { Company } from "@medcal/db";
import { renderWorkOrderPdf, workOrderPdfFilename } from "./work-order-pdf";
import type { WorkOrderPdfSource } from "./work-order-pdf-shared";

describe("workOrderPdfFilename", () => {
  it("formats PKM-SPK-YYYYMMDD-sequence from the WorkOrder number and issue date", () => {
    expect(
      workOrderPdfFilename({
        number: "SPK/2026/08/00001",
        companyId: "PKM",
        issuedAt: "2026-08-27T03:00:00.000Z",
      }),
    ).toBe("PKM-SPK-20260827-00001.pdf");
  });

  it("formats PKM-WOL-YYYYMMDD-sequence for an In Lab Work Order", () => {
    expect(
      workOrderPdfFilename({
        number: "WOL/2026/09/00042",
        companyId: "PKM",
        issuedAt: "2026-09-03T03:00:00.000Z",
      }),
    ).toBe("PKM-WOL-20260903-00042.pdf");
  });
});

const company: Company = {
  id: "PKM",
  name: "PT Presisi Kalibrasi Medika",
  legalName: "PT PRESISI KALIBRASI MEDIKA",
  taxId: "01.234.567.8-999.000",
  address: "Jakarta Timur",
  phone: "021-1234567",
  email: "info@pkm.co.id",
  status: "ACTIVE",
  settingsJson: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

function makeSource(overrides: Partial<WorkOrderPdfSource> = {}): WorkOrderPdfSource {
  return {
    number: "SPK/2026/08/00001",
    createdAt: new Date("2026-08-14T02:00:00.000Z"),
    status: "ASSIGNED",
    serviceMode: "ON_SITE",
    addressText: "Jl. Cipendawa Baru, RT.003/RW.002, Bantargebang, Kota Bekasi, Jawa Barat 17151",
    locationNotes: null,
    geoLat: null,
    geoLng: null,
    scheduledStart: new Date("2026-08-14T02:00:00.000Z"),
    scheduledEnd: null,
    customer: {
      name: "PT Bumi Indah Putra",
      number: "CUS/2026/07/00003",
      legalName: "PT BUMI INDAH PUTRA",
      address: "Jl. Cipendawa Baru, RT.003/RW.002, Bantargebang, Kota Bekasi, Jawa Barat 17151",
      phone: "021-8000000",
      mobile: "0812-0000-0000",
      email: "purchasing@bumiindah.co.id",
      taxId: null,
      contacts: [{ name: "Ridwan", isPrimary: true, title: "Staff Teknik", phone: "0812-1111-2222", email: "ridwan@bumiindah.co.id" }],
    },
    purchaseOrder: {
      number: "PUR/2026/08/00007",
      customerPoNumber: "74-SPH-PKM-2026",
      customerPoDate: new Date("2026-07-30T00:00:00.000Z"),
    },
    quotation: { number: "QUO/2026/07/00005", request: { number: "CRQ/2026/07/00009" } },
    assignments: [
      { roleOnJob: "LEAD", technician: { name: "Farras Zuhdi", email: "farras@pkm.co.id" } },
    ],
    items: [
      {
        description: "Kalibrasi Centrifuge",
        qty: 4,
        purchaseOrderItem: {
          quotationItem: { requestItem: { deviceId: "BIP-CF-01", deviceType: { name: "Centrifuge" } } },
          device: { brand: "BIPMED", model: "BCF-301-01", serialNumber: "BCF1-VII260004" },
        },
      },
    ],
    ...overrides,
  };
}

function pageCount(pdf: Buffer): number {
  return (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}

describe("renderWorkOrderPdf", () => {
  it("renders an SPK (Surat Perintah Kerja) for an ON_SITE Work Order", async () => {
    const result = await renderWorkOrderPdf({ workOrder: makeSource(), company });

    expect(result.filename).toBe("PKM-SPK-20260814-00001.pdf");
    expect(result.buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(result.buffer.length).toBeGreaterThan(2000);
    expect(pageCount(result.buffer)).toBe(1);
  });

  it("renders a WOL (Formulir Work Order) for a SEND_TO_LAB Work Order", async () => {
    const result = await renderWorkOrderPdf({
      workOrder: makeSource({ number: "WOL/2026/09/00001", serviceMode: "SEND_TO_LAB" }),
      company,
    });

    expect(result.filename).toBe("PKM-WOL-20260814-00001.pdf");
    expect(result.buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(result.buffer.length).toBeGreaterThan(2000);
    expect(pageCount(result.buffer)).toBeGreaterThanOrEqual(1);
  });

  it("keeps the SPK to a single page and flows many WOL equipment rows onto extra pages", async () => {
    const manyItems: WorkOrderPdfSource["items"] = Array.from({ length: 40 }, (_, i) => ({
      description: `Kalibrasi Alat Medis Dengan Nama Yang Panjang Sekali Nomor ${i + 1}`,
      qty: 1,
      purchaseOrderItem: {
        quotationItem: {
          requestItem: { deviceId: `SN-${i + 1}`, deviceType: { name: `Device Type ${i + 1}` } },
        },
        device: { brand: "BRANDX", model: `MODEL-${i + 1}`, serialNumber: `SERIAL-NUMBER-${i + 1}` },
      },
    }));

    const spk = await renderWorkOrderPdf({ workOrder: makeSource({ items: manyItems }), company });
    expect(pageCount(spk.buffer)).toBe(1); // SPK does not list items

    const wol = await renderWorkOrderPdf({
      workOrder: makeSource({ number: "WOL/2026/09/00002", serviceMode: "SEND_TO_LAB", items: manyItems }),
      company,
    });
    expect(pageCount(wol.buffer)).toBeGreaterThan(1);
  });

  it("does not throw when optional data is missing (no PO, no contacts, no device, no assignees)", async () => {
    const bare = makeSource({
      number: "WOL/2026/09/00003",
      serviceMode: "SEND_TO_LAB",
      purchaseOrder: null,
      addressText: null,
      scheduledStart: null,
      assignments: [],
      customer: {
        name: "PT Tanpa Kontak",
        number: "CUS/2026/09/00099",
        legalName: null,
        address: null,
        phone: null,
        email: null,
        taxId: null,
        contacts: [],
      },
      items: [
        {
          description: "Kalibrasi Tanpa Device",
          qty: 1,
          purchaseOrderItem: {
            quotationItem: { requestItem: null },
            device: null,
          },
        },
      ],
    });

    const result = await renderWorkOrderPdf({ workOrder: bare, company });
    expect(result.buffer.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
