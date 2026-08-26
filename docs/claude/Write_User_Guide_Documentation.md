# WRITE — User Guide Documentation for Device Management & Calibration Management

## Mode
This produces DOCUMENTATION ONLY — a guide for business users (project owner, admin staff),
not a technical/developer reference. Do NOT modify any schema, code, or data. You MAY create
new documentation file(s) at the path(s) specified in "Output" below — that's the only file
creation allowed in this task.

## Audience and tone

The reader is a business user — the project owner, an admin staff member, or a new hire being
onboarded — NOT a developer. They don't know what "Prisma," "FK," "schema," or "seed" mean,
and they don't need to. Write for someone who needs to understand:
- What each part of the system is, in plain everyday language.
- What it's actually FOR — why it exists, what problem it solves in the calibration business.
- How it's used in day-to-day work (e.g. "when a staff member creates a new device record,
  they pick from this list...").
- How it connects to the other parts (e.g. "every Calibration Request must reference an
  existing Customer").

Avoid technical jargon entirely. Where a technical concept is unavoidable (e.g. explaining
that "Capability" is a reusable category shared across many device types), explain it with a
concrete, real example from the actual data (e.g. "Electrical Safety checks are shared by
almost every device — Blood Pressure Monitor, Ventilator, ECG machine all use the exact same
4 checks: Earth Resistance, Insulation Resistance, and two Leakage Current tests") rather than
an abstract definition.

Write in Bahasa Indonesia (match the language used elsewhere in this project's documentation
and by the project's staff), in a friendly, clear, non-condescending tone.

**Language requirement — read carefully, this is stricter than a normal translation note:**
Use simple, everyday Bahasa Indonesia throughout. Minimize foreign/English terms — the ONLY
foreign terms allowed are ones genuinely native to the calibration/medical-device domain
itself (e.g. "kalibrasi," "tolerance/toleransi," device/instrument names like "Blood Pressure
Monitor" or "Ventilator" where no natural Indonesian equivalent is in everyday use, unit
symbols like "mmHg" or "°C"). Everything else — every software/system term — must be written
in plain Indonesian:
- Say "Jenis Alat" not "Device Type," "Kategori Alat" not "Device Category," "Kemampuan
  Pengukuran" or "Jenis Pengukuran" not "Capability," "Parameter Kalibrasi" not "Calibration
  Parameter," "Data Alat" not "Device record," "Pelanggan" not "Customer," "Permintaan
  Kalibrasi" not "Calibration Request," and so on for every concept in this document.
- It's fine to mention the English/technical name ONCE in parentheses the first time a
  section introduces a concept, if that name is what actually appears as a menu/page label in
  the Portal UI (so the reader can match this guide to what they see on screen) — e.g.
  "Kategori Alat (halaman 'Categories' di menu Device Management)." After that first mention,
  use the Indonesian term consistently for the rest of the document.
- Avoid English filler words common in tech writing ("workflow," "record," "field," "form,"
  "button," "list," "status") — use "alur kerja," "data/catatan," "kolom/isian," "formulir,"
  "tombol," "daftar," "status" is acceptable since it's fully absorbed into everyday
  Indonesian, but prefer Indonesian alternatives elsewhere.
- Before finalizing, do a self-check pass: read through what you wrote and flag/replace any
  remaining English word that has a natural, commonly-understood Indonesian equivalent.

## CRITICAL — verify everything against the live system, do not rely on old reports

Multiple investigation/implementation reports exist in this project's docs folder describing
this system as it evolved over time (numbers, field names, and even device counts have
changed between reports — e.g. an earlier estimate of "~22 new device types" turned out to
actually be 24 once implemented). **Do not use any of those historical reports as your source
of truth for current numbers or structure.** Instead, read the LIVE current state directly:
- Query the actual database (or read the actual seed files) for current row counts and
  content in `DeviceCategory`, `DeviceType`, `DeviceModel`, `DeviceCapability`,
  `DeviceCapabilityItem`, `DeviceCalibrationParameter`, `Device`, `Customer`, and
  `CalibrationRequest`-related tables.
- Read the actual current Prisma schema (`packages/db/prisma/schema.prisma`) for accurate
  field/relationship descriptions.
- Read the actual current Portal UI (`apps/portal`) for each of these areas to describe the
  real user-facing workflow (what fields a staff member sees, what buttons/actions exist) —
  don't describe a workflow that isn't actually built. If a feature described in an old report
  doesn't actually exist in the UI yet, don't document it as if it exists.

If you find any of the above genuinely doesn't exist yet or is incomplete (e.g. a "Models"
page with no way to add data), say so honestly in the documentation rather than describing an
idealized version — a business user relying on this guide needs it to match reality.

## Scope — what to document

### Part 1: Device Management (6 sections)
1. **Categories** (`DeviceCategory`) — what device categories exist today, what they're for,
   how they group device types.
2. **Types** (`DeviceType`) — what a "device type" means in this system, how it relates to
   Categories, roughly how many exist and what kinds of devices they cover (give real
   examples from the actual data, don't just say "many").
3. **Models** (`DeviceModel`) — what this is for (brand/model catalog), and be honest that
   it's currently empty/not yet in active use if that's still the case when you check — don't
   describe it as populated if it isn't.
4. **Capabilities** (`DeviceCapability`/`DeviceCapabilityItem`) — this is the hardest concept
   to explain simply. Explain it as "the reusable checklist of things that CAN be measured,"
   distinct from Device Types (which is "what kind of physical device"). Use the Electrical
   Safety example (or a similarly clear real example you find) to show how one Capability is
   shared across many different device types.
5. **Calibration Parameters** (`DeviceCalibrationParameter`) — explain this as "for a specific
   device type, exactly which checks apply, and what the pass/fail limit is for each." Give a
   concrete real example (e.g. pick one actual device type and show its actual parameters and
   tolerances as they exist in the live data).
6. **Device** (`Device`) — explain this as the actual physical equipment record belonging to a
   specific customer (as opposed to Device Type, which is the general category). Explain how
   staff create one (via the Portal UI you should check), and that it starts empty/grows as
   staff use the system — this is normal, not a bug.

### Part 2: Calibration Management (2 sections — NOT 3; Quotation does not exist yet)
1. **Customer** — what a customer record is, what it's used for, how it connects to
   Calibration Requests and Devices.
2. **Calibration Request** — the full real workflow as it exists today in the Portal UI: what
   a staff member does to create one, what fields they fill in, what happens after (status
   changes — describe using the ACTUAL current status list, not any older/incorrect one you
   might find referenced in old reports), and what its relationship is to Customer and Device.

**Do NOT write a section for Quotation.** It has not been built yet as of this task. If you
want to acknowledge its existence, a single sentence noting "Quotation module is planned but
not yet built" is fine at the end of Part 2 — do not describe its expected workflow or invent
what it might look like.

## Structure suggestion (adjust as needed based on what you find)

For each of the 8 sections above, aim for a consistent, short structure:
- **Apa ini?** (What is it — 2-3 sentences, plain language)
- **Untuk apa?** (What's it for — the practical purpose)
- **Contoh nyata** (A real example pulled from actual current data)
- **Kaitannya dengan bagian lain** (How it connects to other parts — 1-2 sentences with a
  simple diagram/arrow notation if helpful, e.g. "Device Type → menentukan → Capability apa
  saja yang relevan")

Keep each section reasonably short (a business user should be able to read the whole document
in under 15 minutes) — this is an orientation guide, not exhaustive technical documentation.

## Output

Write to: `D:\medcal\docs\claude\plans\Calibration-management\panduan-device-dan-calibration-management.md`

Start with a short intro paragraph explaining what this document covers and who it's for.
End with a brief note on what's NOT covered yet (Quotation and beyond), so the reader knows
this guide will need a follow-up once more of the system is built.

Confirm in your final chat message that you verified content against the live system (not
just prior reports) and note any place where you found the actual system differs from what
older documentation/reports described.
