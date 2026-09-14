import { describe, expect, it } from "vitest";
import {
  buildKontrolAlatSignatureSlots,
  canEditKontrolAlat,
  KONTROL_ALAT_SIGNER_SLOTS,
  shouldShowLengkapiKontrolAlatCta,
} from "./kontrol-alat";
import type { TechKontrolAlatSignature } from "./types";

function sig(
  partial: Pick<TechKontrolAlatSignature, "id" | "signerKind"> &
    Partial<TechKontrolAlatSignature>,
): TechKontrolAlatSignature {
  return {
    kontrolAlatId: "ka1",
    signerUserId: "u1",
    signerName: "Ada Nama",
    signedAt: "2026-09-14T02:00:00.000Z",
    ...partial,
  };
}

describe("buildKontrolAlatSignatureSlots", () => {
  it("always returns Administrasi then Petugas Teknis when there are zero rows", () => {
    const slots = buildKontrolAlatSignatureSlots([]);
    expect(slots).toHaveLength(2);
    expect(KONTROL_ALAT_SIGNER_SLOTS).toEqual(["ADMINISTRATION", "TECHNICAL_OFFICER"]);
    expect(slots[0]).toMatchObject({
      kind: "ADMINISTRATION",
      label: "Administrasi",
      signature: undefined,
    });
    expect(slots[1]).toMatchObject({
      kind: "TECHNICAL_OFFICER",
      label: "Petugas Teknis",
      signature: undefined,
    });
  });

  it("merges an existing Administrasi row into the first slot", () => {
    const admin = sig({ id: "s-admin", signerKind: "ADMINISTRATION" });
    const slots = buildKontrolAlatSignatureSlots([admin]);
    expect(slots[0]!.signature).toEqual(admin);
    expect(slots[1]!.signature).toBeUndefined();
  });
});

describe("canEditKontrolAlat", () => {
  it("keeps PENDING editable when the actor may record", () => {
    expect(canEditKontrolAlat(true, "PENDING")).toBe(true);
  });

  it("locks inspection after start", () => {
    expect(canEditKontrolAlat(true, "IN_PROGRESS")).toBe(false);
    expect(canEditKontrolAlat(true, "SUBMITTED")).toBe(false);
    expect(canEditKontrolAlat(true, "REWORK")).toBe(false);
    expect(canEditKontrolAlat(true, "ACCEPTED_BY_QA")).toBe(false);
  });

  it("hides edits without recordKontrolAlat", () => {
    expect(canEditKontrolAlat(false, "PENDING")).toBe(false);
  });
});

describe("shouldShowLengkapiKontrolAlatCta", () => {
  const wolIncomplete = {
    serviceMode: "SEND_TO_LAB" as const,
    jobStatus: "PENDING" as const,
    completedAt: null as string | null,
    canRecord: true,
  };

  it("shows the CTA for an incomplete PENDING WOL job", () => {
    expect(shouldShowLengkapiKontrolAlatCta(wolIncomplete)).toBe(true);
  });

  it("hides the CTA after Kontrol Alat is completed", () => {
    expect(
      shouldShowLengkapiKontrolAlatCta({
        ...wolIncomplete,
        completedAt: "2026-09-14T03:00:00.000Z",
      }),
    ).toBe(false);
  });

  it("never shows the CTA for ON_SITE", () => {
    expect(
      shouldShowLengkapiKontrolAlatCta({
        ...wolIncomplete,
        serviceMode: "ON_SITE",
      }),
    ).toBe(false);
  });

  it("hides the CTA without record permission", () => {
    expect(shouldShowLengkapiKontrolAlatCta({ ...wolIncomplete, canRecord: false })).toBe(false);
  });
});
