/**
 * Seeds DeviceTypeAlias master data — INITIAL ALIAS KNOWLEDGE BASE.
 *
 * Source of truth (SOLE):
 *   docs/claude/plans/device-management/device-alias/device-type-aliases-name-list.xlsx
 *   (corrected file, 171 data rows; "Canonical DeviceType" populated on every
 *   row — no forward-fill; each row processed independently).
 *
 * SEEDING POLICY (changed 2026-08-30):
 *   The Excel "Status" column is now INFORMATIONAL ONLY. All candidate aliases
 *   — APPROVED, REVIEW and REVIEW ⚠️ — are seeded so administrators can review
 *   and prune them in the DeviceTypeAlias management UI. Status never reduces
 *   the insert count. This seed is NOT the business-approval mechanism.
 *
 * Still enforced (technical / data-integrity, not business judgement):
 *   - "—" rows: skipped as CANONICAL / REDUNDANT when
 *     normalize(alias) === normalize(canonical DeviceType name). A "—" row
 *     whose alias diverges meaningfully after normalization is NOT discarded —
 *     it is seeded and reported (DASH_DIVERGENT).
 *   - Any row (any status) where normalize(alias) === normalize(canonical
 *     DeviceType name) → CANONICAL / REDUNDANT, not seeded.
 *   - Canonical DeviceType resolved by EXACT normalized name against the live
 *     master. No fuzzy match. No DeviceType is created or renamed.
 *     Unmatched canonical → UNMATCHED CANONICAL DEVICETYPE, alias not seeded.
 *   - DeviceTypeAlias.@@unique([normalizedAlias]) is global → one normalized
 *     alias maps to exactly one DeviceType:
 *       · same normalized alias already in DB for the SAME DeviceType
 *         → ALREADY EXISTS (skip, idempotent).
 *       · same normalized alias already in DB for a DIFFERENT DeviceType,
 *         OR two candidate rows share a normalized alias but point to
 *         different DeviceTypes → COLLISION. Not inserted, not overwritten,
 *         not reassigned, not deleted — reported for manual resolution.
 *       · two candidate rows share a normalized alias AND the same DeviceType
 *         → one record inserted (DUPLICATE CANDIDATE collapsed).
 *   - An alias whose normalized form equals a DIFFERENT DeviceType's exact
 *     name is still seeded (per the new broad-coverage policy) but flagged
 *     SHADOWS_DEVICETYPE_NAME (the Excel import resolver matches EXACT_NAME
 *     before ALIAS, so such an alias is inert until an admin curates it).
 *   - Idempotent, re-runnable; never deletes / reassigns existing aliases;
 *     never touches DeviceType, schema, migrations, API, UI, RBAC.
 *
 * NOTE (row 15): the corrected Excel canonical is "Cold Chain" but the live
 * DeviceType is still the typo "Coald Chain" → both row-15 aliases report as
 * UNMATCHED. Fix belongs to a separate DeviceType name-fix task.
 *
 * Normalization: `normalizeDeviceTerm` from @medcal/shared — the exact
 * function used by calibration-request-import.service.ts and
 * DeviceTypeAliasesService. No second algorithm.
 *
 * DRY RUN by default. Pass --commit to write.
 *   Dry run : pnpm --filter @medcal/db run seed:device-type-aliases
 *   Commit  : pnpm --filter @medcal/db run seed:device-type-aliases -- --commit
 */
import { prisma } from "../src/index";
import { normalizeDeviceTerm } from "../../shared/src/utils";

const COMMIT = process.argv.includes("--commit");

/** Raw Excel status, kept verbatim for reporting. "DASH" == the "—" marker. */
type Status = "APPROVED" | "REVIEW" | "REVIEW_WARN" | "DASH";

interface CandidateRow {
  /** "Canonical DeviceType" column, verbatim (present on every row). */
  canonical: string;
  /** "Candidate alias" column, verbatim. */
  alias: string;
  status: Status;
}

/** Verbatim transcription of the corrected Excel. Order matches the "#" column. */
const ROWS: CandidateRow[] = [
  { canonical: "Ambulatory ECG", alias: "Holter", status: "REVIEW" },
  { canonical: "Ambulatory ECG", alias: "Holter ECG", status: "REVIEW" },
  { canonical: "Aspirators (Surgical, Thoracic, and Uterine)/ Suction", alias: "Aspirator", status: "REVIEW" },
  { canonical: "Aspirators (Surgical, Thoracic, and Uterine)/ Suction", alias: "Suction Aspirator", status: "REVIEW" },
  { canonical: "Aspirators (Surgical, Thoracic, and Uterine)/ Suction", alias: "Aspirator/Suction", status: "REVIEW" },
  { canonical: "Audiometer", alias: "Audiometer", status: "DASH" },
  { canonical: "Audiometer", alias: "Audiometer alat uji pendengaran", status: "REVIEW" },
  { canonical: "Autoclave", alias: "Autoclave", status: "DASH" },
  { canonical: "Autoclave", alias: "Autoklaf", status: "APPROVED" },
  { canonical: "Baby Incubator", alias: "Baby Incubator", status: "DASH" },
  { canonical: "Baby Incubator", alias: "Inkubator Bayi", status: "APPROVED" },
  { canonical: "Baby Incubator", alias: "Inkubator bayi", status: "APPROVED" },
  { canonical: "Bed Side Monitor", alias: "Patient Monitor", status: "APPROVED" },
  { canonical: "Bed Side Monitor", alias: "Bedside Monitor", status: "APPROVED" },
  { canonical: "Bed Side Monitor", alias: "Bed Side Monitor", status: "APPROVED" },
  { canonical: "Bed Side Monitor", alias: "Monitor Pasien", status: "REVIEW" },
  { canonical: "Bio Safety Cabinet", alias: "Biosafety Cabinet", status: "APPROVED" },
  { canonical: "Bio Safety Cabinet", alias: "BSC", status: "REVIEW" },
  { canonical: "Bio Safety Cabinet", alias: "Biological Safety Cabinet", status: "REVIEW" },
  { canonical: "Blanket Warmer", alias: "Blanket Warmer", status: "DASH" },
  { canonical: "Blanket Warmer", alias: "Penghangat Selimut", status: "REVIEW" },
  { canonical: "Blood Bank Refrigerators", alias: "Blood Bank Refrigerator", status: "APPROVED" },
  { canonical: "Blood Bank Refrigerators", alias: "Blood Bank Fridge", status: "REVIEW" },
  { canonical: "Blood Bank Refrigerators", alias: "Kulkas Bank Darah", status: "REVIEW" },
  { canonical: "Blood Pressure Monitor", alias: "Blood Pressure Monitor", status: "DASH" },
  { canonical: "Blood Pressure Monitor", alias: "BP Monitor", status: "APPROVED" },
  { canonical: "Blood Pressure Monitor", alias: "Tensimeter", status: "REVIEW_WARN" },
  { canonical: "Blood Pressure Monitor", alias: "Sphygmomanometer", status: "REVIEW_WARN" },
  { canonical: "Breast Pumps (suction)", alias: "Breast Pump", status: "APPROVED" },
  { canonical: "Breast Pumps (suction)", alias: "Breast Pumps", status: "APPROVED" },
  { canonical: "Breast Pumps (suction)", alias: "Pompa ASI", status: "REVIEW" },
  { canonical: "Cardiac Output Units (heart rate)", alias: "Cardiac Output Monitor", status: "REVIEW" },
  { canonical: "Cardiac Output Units (heart rate)", alias: "Cardiac Output Unit", status: "REVIEW" },
  { canonical: "Centrifuge", alias: "Centrifuge", status: "DASH" },
  { canonical: "Centrifuge", alias: "Sentrifus", status: "APPROVED" },
  { canonical: "Centrifuge", alias: "Centrifugal", status: "REVIEW" },
  { canonical: "Centrifuge Refrigerator", alias: "Centrifuge Refrigerator", status: "DASH" },
  { canonical: "Centrifuge Refrigerator", alias: "Refrigerated Centrifuge", status: "REVIEW" },
  { canonical: "Centrifuge Refrigerator", alias: "Centrifuge berpendingin", status: "REVIEW" },
  { canonical: "Cold Chain", alias: "Cold Chain", status: "APPROVED" },
  { canonical: "Cold Chain", alias: "Cold Chain Equipment", status: "REVIEW" },
  { canonical: "CPAP", alias: "CPAP", status: "DASH" },
  { canonical: "CPAP", alias: "CPAP Machine", status: "APPROVED" },
  { canonical: "CPAP", alias: "Continuous Positive Airway Pressure", status: "REVIEW" },
  { canonical: "Dental Unit", alias: "Dental Unit", status: "DASH" },
  { canonical: "Dental Unit", alias: "Dental Chair Unit", status: "REVIEW" },
  { canonical: "Dental Unit", alias: "Unit Dental", status: "REVIEW" },
  { canonical: "Dental X-Ray", alias: "Dental X-Ray", status: "DASH" },
  { canonical: "Dental X-Ray", alias: "Dental X-ray Machine", status: "APPROVED" },
  { canonical: "Dental X-Ray", alias: "X-Ray Dental", status: "REVIEW" },
  { canonical: "Electric Beds (kelistrikan)", alias: "Electric Bed", status: "APPROVED" },
  { canonical: "Electric Beds (kelistrikan)", alias: "Electric Hospital Bed", status: "REVIEW" },
  { canonical: "Electric Beds (kelistrikan)", alias: "Tempat Tidur Elektrik", status: "REVIEW" },
  { canonical: "Electro Accupunture (EST)", alias: "Electro Acupuncture", status: "APPROVED" },
  { canonical: "Electro Accupunture (EST)", alias: "Electro Acupuncture (EST)", status: "APPROVED" },
  { canonical: "Electro Accupunture (EST)", alias: "EST", status: "REVIEW" },
  { canonical: "Electrocardiographs", alias: "Electrocardiograph", status: "APPROVED" },
  { canonical: "Electrocardiographs", alias: "ECG", status: "APPROVED" },
  { canonical: "Electrocardiographs", alias: "EKG", status: "APPROVED" },
  { canonical: "Examination Lamp", alias: "Examination Light", status: "REVIEW" },
  { canonical: "Examination Lamp", alias: "Examination Lamp", status: "DASH" },
  { canonical: "Examination Lamp", alias: "Lampu Pemeriksaan", status: "REVIEW" },
  { canonical: "Fetal Doppler", alias: "Fetal Doppler", status: "DASH" },
  { canonical: "Fetal Doppler", alias: "Doppler", status: "REVIEW" },
  { canonical: "Fetal Doppler", alias: "Doppler Janin", status: "REVIEW" },
  { canonical: "Flow meter", alias: "Flow Meter", status: "APPROVED" },
  { canonical: "Flow meter", alias: "Flowmeter", status: "APPROVED" },
  { canonical: "Flow meter", alias: "Pengukur Aliran", status: "REVIEW" },
  { canonical: "Head Lamp Medik", alias: "Head Lamp", status: "APPROVED" },
  { canonical: "Head Lamp Medik", alias: "Medical Head Lamp", status: "APPROVED" },
  { canonical: "Head Lamp Medik", alias: "Lampu Kepala Medik", status: "REVIEW" },
  { canonical: "Humidifier", alias: "Humidifier", status: "DASH" },
  { canonical: "Humidifier", alias: "Humidifier Oksigen", status: "REVIEW" },
  { canonical: "Infant Warmer", alias: "Infant Warmer", status: "DASH" },
  { canonical: "Infant Warmer", alias: "Baby Warmer", status: "REVIEW" },
  { canonical: "Infant Warmer", alias: "Infant Radiant Warmer", status: "REVIEW" },
  { canonical: "Infusion Pump", alias: "Infusion Pump", status: "DASH" },
  { canonical: "Infusion Pump", alias: "Infusion Pump Machine", status: "REVIEW" },
  { canonical: "Infusion Pump", alias: "Pompa Infus", status: "APPROVED" },
  { canonical: "Kulkas Vaksin", alias: "Vaccine Refrigerator", status: "APPROVED" },
  { canonical: "Kulkas Vaksin", alias: "Vaccine Fridge", status: "REVIEW" },
  { canonical: "Kulkas Vaksin", alias: "Vaccine Cooler", status: "REVIEW" },
  { canonical: "Kulkas Vaksin", alias: "Kulkas Vaksin", status: "DASH" },
  { canonical: "Laminar Air Flow", alias: "Laminar Flow", status: "APPROVED" },
  { canonical: "Laminar Air Flow", alias: "Laminar Air Flow Cabinet", status: "REVIEW" },
  { canonical: "Laminar Air Flow", alias: "LAF", status: "REVIEW" },
  { canonical: "Lampu Operasi", alias: "Operating Lamp", status: "APPROVED" },
  { canonical: "Lampu Operasi", alias: "Operating Light", status: "REVIEW" },
  { canonical: "Lampu Operasi", alias: "Surgical Lamp", status: "REVIEW" },
  { canonical: "Laryngoskop", alias: "Laryngoscope", status: "APPROVED" },
  { canonical: "Laryngoskop", alias: "Laryngoscope", status: "APPROVED" },
  { canonical: "Laryngoskop", alias: "Laringoskop", status: "APPROVED" },
  { canonical: "Medical Freezer", alias: "Medical Freezer", status: "DASH" },
  { canonical: "Medical Freezer", alias: "Freezer Medis", status: "APPROVED" },
  { canonical: "Medical Freezer", alias: "Medical Laboratory Freezer", status: "REVIEW" },
  { canonical: "Medical Refrigerator", alias: "Medical Refrigerator", status: "DASH" },
  { canonical: "Medical Refrigerator", alias: "Medical Fridge", status: "REVIEW" },
  { canonical: "Medical Refrigerator", alias: "Kulkas Medis", status: "APPROVED" },
  { canonical: "Mikroskop Laboratorium", alias: "Laboratory Microscope", status: "APPROVED" },
  { canonical: "Mikroskop Laboratorium", alias: "Lab Microscope", status: "REVIEW" },
  { canonical: "Mikroskop Laboratorium", alias: "Mikroskop Lab", status: "APPROVED" },
  { canonical: "Nebulizer Compressor", alias: "Compressor Nebulizer", status: "REVIEW" },
  { canonical: "Nebulizer Compressor", alias: "Nebulizer", status: "REVIEW_WARN" },
  { canonical: "Nebulizer Compressor", alias: "Nebulizer Compressor", status: "DASH" },
  { canonical: "Oven", alias: "Laboratory Oven", status: "REVIEW" },
  { canonical: "Oven", alias: "Oven Laboratorium", status: "REVIEW" },
  { canonical: "Oxygen-Air Proportioners", alias: "Oxygen Air Proportioner", status: "APPROVED" },
  { canonical: "Oxygen-Air Proportioners", alias: "Oxygen/Air Proportioner", status: "APPROVED" },
  { canonical: "Oxygen-Air Proportioners", alias: "Oxygen Blender", status: "REVIEW_WARN" },
  { canonical: "Oxygen Concentrators", alias: "Oxygen Concentrator", status: "APPROVED" },
  { canonical: "Oxygen Concentrators", alias: "Oxygen Concentrator Machine", status: "REVIEW" },
  { canonical: "Oxygen Concentrators", alias: "Konsentrator Oksigen", status: "APPROVED" },
  { canonical: "Oxymeter monitor", alias: "Oximeter Monitor", status: "APPROVED" },
  { canonical: "Oxymeter monitor", alias: "Pulse Oximeter Monitor", status: "REVIEW_WARN" },
  { canonical: "Oxymeter monitor", alias: "Oxymeter", status: "REVIEW_WARN" },
  { canonical: "Paraffin Baths", alias: "Paraffin Bath", status: "APPROVED" },
  { canonical: "Paraffin Baths", alias: "Paraffin Wax Bath", status: "REVIEW" },
  { canonical: "Paraffin Baths", alias: "Paraffin Bath Machine", status: "REVIEW" },
  { canonical: "Patient Monitor", alias: "Patient Monitor", status: "DASH" },
  { canonical: "Patient Monitor", alias: "Patient Monitoring", status: "REVIEW" },
  { canonical: "Patient Monitor", alias: "Monitor Pasien", status: "REVIEW" },
  { canonical: "Phototherapy", alias: "Phototherapy Unit", status: "APPROVED" },
  { canonical: "Phototherapy", alias: "Phototherapy Lamp", status: "REVIEW" },
  { canonical: "Phototherapy", alias: "Alat Fototerapi", status: "REVIEW" },
  { canonical: "Platelet Agitator Incubator", alias: "Platelet Agitator", status: "REVIEW" },
  { canonical: "Platelet Agitator Incubator", alias: "Platelet Incubator", status: "REVIEW" },
  { canonical: "Platelet Agitator Incubator", alias: "Platelet Agitator Incubator", status: "DASH" },
  { canonical: "Pulse Oximeters", alias: "Pulse Oximeter", status: "APPROVED" },
  { canonical: "Pulse Oximeters", alias: "Oximeter", status: "REVIEW_WARN" },
  { canonical: "Pulse Oximeters", alias: "Oxymeter", status: "REVIEW_WARN" },
  { canonical: "Pulse Oximeters", alias: "Pulse Ox", status: "REVIEW" },
  { canonical: "Radiant Warmer", alias: "Radiant Warmer", status: "DASH" },
  { canonical: "Radiant Warmer", alias: "Infant Radiant Warmer", status: "REVIEW_WARN" },
  { canonical: "Radiant Warmer", alias: "Baby Radiant Warmer", status: "REVIEW_WARN" },
  { canonical: "Radiant Warmers (Adult)", alias: "Adult Radiant Warmer", status: "APPROVED" },
  { canonical: "Radiant Warmers (Adult)", alias: "Radiant Warmer Adult", status: "APPROVED" },
  { canonical: "Radiant Warmers (Adult)", alias: "Adult Warmer", status: "REVIEW" },
  { canonical: "Regulators (Air, O2, Suction [except tracheal])", alias: "Air/O2/Suction Regulator", status: "REVIEW" },
  { canonical: "Regulators (Air, O2, Suction [except tracheal])", alias: "Regulator O2", status: "REVIEW_WARN" },
  { canonical: "Regulators (Air, O2, Suction [except tracheal])", alias: "Regulator Suction", status: "REVIEW_WARN" },
  { canonical: "Regulators (Low-Volume Suction)", alias: "Low-Volume Suction Regulator", status: "APPROVED" },
  { canonical: "Regulators (Low-Volume Suction)", alias: "Low Volume Suction Regulator", status: "APPROVED" },
  { canonical: "Resuscitators (Cardiac)", alias: "Cardiac Resuscitator", status: "APPROVED" },
  { canonical: "Resuscitators (Cardiac)", alias: "Cardiac Resuscitator", status: "APPROVED" },
  { canonical: "Resuscitators (Pulmonary)", alias: "Pulmonary Resuscitator", status: "APPROVED" },
  { canonical: "Resuscitators (Pulmonary)", alias: "Pulmonary Resuscitator", status: "APPROVED" },
  { canonical: "Rotator", alias: "Rotator", status: "DASH" },
  { canonical: "Rotator", alias: "Laboratory Rotator", status: "REVIEW" },
  { canonical: "Rotator", alias: "Tube Rotator", status: "REVIEW" },
  { canonical: "Sphygmomanometers", alias: "Sphygmomanometer", status: "APPROVED" },
  { canonical: "Sphygmomanometers", alias: "Tensimeter", status: "REVIEW_WARN" },
  { canonical: "Sphygmomanometers", alias: "Tensimeter Manual", status: "REVIEW" },
  { canonical: "Spirometer", alias: "Spirometer", status: "DASH" },
  { canonical: "Spirometer", alias: "Spirometry", status: "REVIEW" },
  { canonical: "Spirometer", alias: "Alat Spirometri", status: "REVIEW" },
  { canonical: "Sterillizer (Sterillisator)", alias: "Sterilizer", status: "APPROVED" },
  { canonical: "Sterillizer (Sterillisator)", alias: "Sterilisator", status: "APPROVED" },
  { canonical: "Sterillizer (Sterillisator)", alias: "Sterillizer", status: "DASH" },
  { canonical: "Suction Pump", alias: "Suction Pump", status: "DASH" },
  { canonical: "Suction Pump", alias: "Suction Machine", status: "REVIEW" },
  { canonical: "Suction Pump", alias: "Pompa Suction", status: "REVIEW" },
  { canonical: "Syringe Pump", alias: "Syringe Pump", status: "DASH" },
  { canonical: "Syringe Pump", alias: "Syringe Infusion Pump", status: "REVIEW" },
  { canonical: "Syringe Pump", alias: "Pompa Syringe", status: "REVIEW" },
  { canonical: "Ultrasonic Nebulizers", alias: "Ultrasonic Nebulizer", status: "APPROVED" },
  { canonical: "Ultrasonic Nebulizers", alias: "Ultrasonic Nebulizer", status: "APPROVED" },
  { canonical: "Ultrasonic Nebulizers", alias: "Nebulizer Ultrasonic", status: "REVIEW" },
  { canonical: "Ventilator", alias: "Ventilator", status: "DASH" },
  { canonical: "Ventilator", alias: "Ventilator Machine", status: "APPROVED" },
  { canonical: "Ventilator", alias: "Mechanical Ventilator", status: "REVIEW" },
  { canonical: "Ventilator", alias: "Ventilator Medis", status: "REVIEW" },
];

const STATUS_LABEL: Record<Status, string> = {
  APPROVED: "APPROVED",
  REVIEW: "REVIEW",
  REVIEW_WARN: "REVIEW ⚠️",
  DASH: "—",
};

interface Candidate {
  norm: string;
  alias: string;
  status: Status;
  dtId: string;
  dtName: string;
  canonical: string;
  fromDivergentDash: boolean;
}

async function run() {
  const deviceTypes = await prisma.deviceType.findMany({ select: { id: true, name: true } });
  const dtByNorm = new Map<string, { id: string; name: string }>();
  for (const dt of deviceTypes) dtByNorm.set(normalizeDeviceTerm(dt.name), { id: dt.id, name: dt.name });

  const existing = await prisma.deviceTypeAlias.findMany({
    include: { deviceType: { select: { id: true, name: true } } },
  });
  const existingByNorm = new Map<string, { deviceTypeId: string; deviceTypeName: string; alias: string }>();
  for (const a of existing) {
    existingByNorm.set(a.normalizedAlias, {
      deviceTypeId: a.deviceTypeId,
      deviceTypeName: a.deviceType.name,
      alias: a.alias,
    });
  }

  const counts = { APPROVED: 0, REVIEW: 0, REVIEW_WARN: 0, DASH: 0 };

  const canonicalRedundant: Array<{ alias: string; canonical: string; status: Status }> = [];
  const unmatched: Array<{ alias: string; canonical: string; status: Status }> = [];
  const blankAlias: Array<{ canonical: string }> = [];
  const candidates: Candidate[] = [];

  for (const row of ROWS) {
    counts[row.status]++;

    const norm = normalizeDeviceTerm(row.alias);
    if (!norm) {
      blankAlias.push({ canonical: row.canonical });
      continue;
    }

    const dt = dtByNorm.get(normalizeDeviceTerm(row.canonical));
    if (!dt) {
      unmatched.push({ alias: row.alias, canonical: row.canonical, status: row.status });
      continue;
    }

    const isCanonicalName = norm === normalizeDeviceTerm(dt.name);
    if (isCanonicalName) {
      canonicalRedundant.push({ alias: row.alias, canonical: row.canonical, status: row.status });
      continue;
    }

    candidates.push({
      norm,
      alias: row.alias.trim(),
      status: row.status,
      dtId: dt.id,
      dtName: dt.name,
      canonical: row.canonical,
      fromDivergentDash: row.status === "DASH",
    });
  }

  // Group candidates by normalized alias.
  const byNorm = new Map<string, Candidate[]>();
  for (const c of candidates) {
    const list = byNorm.get(c.norm) ?? [];
    list.push(c);
    byNorm.set(c.norm, list);
  }

  const willSeed: Array<{ alias: string; dtName: string; norm: string; status: Status; divergentDash: boolean; shadows?: string }> = [];
  const alreadyExists: Array<{ alias: string; dtName: string; norm: string }> = [];
  const duplicateCollapsed: Array<{ alias: string; dtName: string; norm: string }> = [];
  const collisions: Array<{ norm: string; detail: string }> = [];

  for (const [norm, list] of byNorm) {
    const distinctDt = [...new Set(list.map((c) => c.dtId))];

    if (distinctDt.length > 1) {
      const parts = distinctDt.map((id) => {
        const c = list.find((x) => x.dtId === id)!;
        return `"${c.dtName}" (row alias "${c.alias}", ${STATUS_LABEL[c.status]})`;
      });
      collisions.push({ norm, detail: `candidate rows disagree on target: ${parts.join("  vs  ")}` });
      continue;
    }

    const target = list[0]!;
    const pre = existingByNorm.get(norm);
    if (pre) {
      if (pre.deviceTypeId === target.dtId) {
        alreadyExists.push({ alias: pre.alias, dtName: pre.deviceTypeName, norm });
      } else {
        collisions.push({
          norm,
          detail: `already in DB -> "${pre.deviceTypeName}" (alias "${pre.alias}"); Excel wants -> "${target.dtName}"`,
        });
      }
      continue;
    }

    // choose the representative row: prefer APPROVED, then REVIEW, then REVIEW_WARN, then DASH
    const rank: Record<Status, number> = { APPROVED: 0, REVIEW: 1, REVIEW_WARN: 2, DASH: 3 };
    const chosen = [...list].sort((a, b) => rank[a.status] - rank[b.status])[0]!;
    for (const c of list) if (c !== chosen) duplicateCollapsed.push({ alias: c.alias, dtName: c.dtName, norm });

    const shadowDt = dtByNorm.get(norm);
    willSeed.push({
      alias: chosen.alias,
      dtName: chosen.dtName,
      norm,
      status: chosen.status,
      divergentDash: chosen.fromDivergentDash,
      shadows: shadowDt && shadowDt.id !== chosen.dtId ? shadowDt.name : undefined,
    });
  }

  willSeed.sort((a, b) => a.dtName.localeCompare(b.dtName) || a.alias.localeCompare(b.alias));

  // ---------- report ----------
  const line = (s = "") => console.log(s);
  line(`\n=========  DeviceTypeAlias SEED (initial knowledge base)  —  ${COMMIT ? "COMMIT" : "DRY RUN"}  =========`);
  line(`Source: docs/claude/plans/device-management/device-alias/device-type-aliases-name-list.xlsx`);
  line(`DeviceType master rows: ${deviceTypes.length}   Existing DeviceTypeAlias rows: ${existing.length}`);

  line(`\n--- WILL SEED (${willSeed.length}) ---`);
  for (const x of willSeed) {
    const tags = [STATUS_LABEL[x.status]];
    if (x.divergentDash) tags.push("DASH_DIVERGENT");
    if (x.shadows) tags.push(`SHADOWS_DEVICETYPE_NAME("${x.shadows}")`);
    line(`  ${x.alias}  ->  ${x.dtName}   [${tags.join(", ")}]`);
  }

  line(`\n--- ALREADY EXISTS / IDEMPOTENT (${alreadyExists.length}) ---`);
  for (const x of alreadyExists) line(`  ${x.alias}  ->  ${x.dtName}`);

  line(`\n--- DUPLICATE CANDIDATE (same normalized alias + same DeviceType; collapsed) (${duplicateCollapsed.length}) ---`);
  for (const x of duplicateCollapsed) line(`  ${x.alias}  ->  ${x.dtName}   [norm: ${x.norm}]`);

  line(`\n--- CANONICAL / REDUNDANT (alias == canonical DeviceType name) (${canonicalRedundant.length}) ---`);
  for (const x of canonicalRedundant) line(`  ${x.alias}  ->  ${x.canonical}   [${STATUS_LABEL[x.status]}]`);

  line(`\n--- COLLISION / BLOCKED (not inserted, not reassigned) (${collisions.length}) ---`);
  for (const x of collisions) line(`  [${x.norm}]  ${x.detail}`);

  line(`\n--- UNMATCHED CANONICAL DEVICETYPE (${unmatched.length}) ---`);
  for (const x of unmatched)
    line(`  canonical="${x.canonical}"  alias="${x.alias}"  status=${STATUS_LABEL[x.status]}  reason=no DeviceType with this exact name (no fuzzy match)`);

  if (blankAlias.length) {
    line(`\n--- BLANK ALIAS AFTER NORMALIZATION (${blankAlias.length}) ---`);
    for (const x of blankAlias) line(`  canonical="${x.canonical}"`);
  }

  line(`\n--- TOTALS ---`);
  line(`  Excel rows processed ................ ${ROWS.length}`);
  line(`  APPROVED candidates ................ ${counts.APPROVED}`);
  line(`  REVIEW candidates .................. ${counts.REVIEW}`);
  line(`  REVIEW ⚠️ candidates ................ ${counts.REVIEW_WARN}`);
  line(`  canonical-name (—) rows ............. ${counts.DASH}`);
  line(`  canonical / redundant (skipped) .... ${canonicalRedundant.length}`);
  line(`  duplicate candidates (collapsed) ... ${duplicateCollapsed.length}`);
  line(`  aliases already existing ........... ${alreadyExists.length}`);
  line(`  aliases to insert ................. ${willSeed.length}`);
  line(`  collisions ........................ ${collisions.length}`);
  line(`  unmatched canonical DeviceTypes .... ${unmatched.length}`);

  if (!COMMIT) {
    line(`\nDRY RUN — no database writes. Re-run with --commit to insert.\n`);
    await prisma.$disconnect();
    return;
  }

  line(`\nCOMMIT — inserting ${willSeed.length} aliases ...`);
  let inserted = 0;
  for (const x of willSeed) {
    const clash = await prisma.deviceTypeAlias.findUnique({ where: { normalizedAlias: x.norm } });
    if (clash) continue;
    const dt = dtByNorm.get(normalizeDeviceTerm(x.dtName))!;
    await prisma.deviceTypeAlias.create({
      data: { deviceTypeId: dt.id, alias: x.alias, normalizedAlias: x.norm },
    });
    inserted++;
  }
  const total = await prisma.deviceTypeAlias.count();
  line(`  inserted: ${inserted}`);
  line(`  DeviceTypeAlias total now: ${total}\n`);
  await prisma.$disconnect();
}

run().catch((e) => {
  console.error("[seed] Failed:", e);
  process.exit(1);
});
