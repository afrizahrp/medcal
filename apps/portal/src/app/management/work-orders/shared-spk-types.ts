import type { WorkOrderStatus } from "./work-orders-ui";

/** Mirrors SharedSpkDetail in apps/api (shared-spk.service.ts). Dates arrive as ISO strings. */
export type SharedSpkDerivedStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export interface SpkProgress {
  total: number;
  completed: number;
  /** Quantity-weighted integer 0–100. */
  percentage: number;
}

export interface SharedSpkChild {
  id: string;
  number: string;
  childSequence: number;
  status: WorkOrderStatus;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  technicians: { id: string; name: string | null; email: string; roleOnJob: string }[];
  items: { id: string; purchaseOrderItemId: string; description: string; qty: number }[];
  progress: SpkProgress;
  deliveryNote: { id: string; number: string; status: string; issuedAt: string } | null;
  /** True once the Child left PLANNED/ASSIGNED — execution-locked for revision. */
  locked: boolean;
}

export interface SharedSpkDetail {
  id: string;
  number: string;
  createdAt: string;
  purchaseOrder: { id: string; number: string; customerPoNumber: string; status: string };
  customer: { id: string; name: string };
  createdBy: { id: string; name: string | null } | null;
  status: SharedSpkDerivedStatus;
  progress: SpkProgress;
  children: SharedSpkChild[];
}

export const SHARED_SPK_STATUS_LABELS: Record<SharedSpkDerivedStatus, string> = {
  NOT_STARTED: "Belum dimulai",
  IN_PROGRESS: "Berjalan",
  COMPLETED: "Selesai",
  CANCELLED: "Dibatalkan",
};
