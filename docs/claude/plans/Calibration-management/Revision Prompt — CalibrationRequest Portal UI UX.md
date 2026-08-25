IMPLEMENTATION REVISION PASS — CalibrationRequest Portal UI only.

Revise the existing CalibrationRequest Portal UI based on the current implementation and the requirements below. This is NOT a backend redesign and NOT a new module implementation.

STRICT SCOPE:
- Modify `apps/portal` only.
- Do NOT modify `apps/api`.
- Do NOT modify `packages/db`.
- Do NOT modify Prisma schema or database migrations.
- Do NOT modify `apps/tech-pwa`.
- Do NOT modify Quotation, Purchase Order, Work Order, Invoice, Payment, or any other lifecycle module.
- Do NOT invent new backend business rules.
- Preserve the existing CalibrationRequest API contract.
- Reuse existing portal/shadcn UI patterns wherever possible.
- Before changing anything, inspect the current CalibrationRequest implementation and the existing reusable UI components/patterns in the portal.

PRIMARY OBJECTIVE:
The current CalibrationRequest form is functionally acceptable, but the UX/layout is too narrow and too generic for the intended management workflow. The revision must make the form wider, easier to operate, and more business-oriented without turning it into a visually oversized or unnecessarily complex page.

1. FIX THE MAIN CARD WIDTH / PAGE COMPOSITION

Current problem:
The form card is too narrow relative to the available viewport, leaving excessive blank space on both the left and right sides.

Required result:
- Increase the maximum width of the main CalibrationRequest form/card significantly.
- The form should occupy a much more appropriate proportion of the desktop viewport.
- Do NOT solve this by making individual fields extremely wide while keeping an artificially narrow card.
- Keep a visually balanced left/right margin.
- Preserve responsive behavior on smaller screens.
- The result should feel like a proper management transaction form, not a small centered modal floating in a large empty page.
- Review the existing Customer management pages and other management forms for established container width conventions before choosing the final width.
- Keep the visual hierarchy clean: page title/breadcrumbs → main transaction card → sections → actions.

Do not create unnecessary additional cards merely to fill horizontal space. The objective is a wider, coherent transaction card.

2. REPLACE STANDARD SELECT/COMBOBOX UX WITH SHADCN COMMAND + POPOVER WHERE APPROPRIATE

The current Customer selection uses a standard combobox/select-like control.

For Customer selection:
- Replace the current selection UI with a shadcn-style `Command` + `Popover` pattern.
- The interaction should be similar to the supplied reference screenshot:
  - Click the field.
  - Open a popover.
  - Search customers using Command.
  - Display matching customers clearly.
  - Select one customer.
  - Close the popover.
  - Show the selected customer in the trigger.
- The component must provide proper empty/loading states.
- Do not create a completely new custom dropdown implementation if an existing Command/Popover component is already available in the repository.
- Reuse the portal's existing shadcn primitives and established patterns.

The same interaction pattern should be used for device selection in section 4 below.

Do NOT blindly replace every select on the page. Service Mode can remain a normal select if that is consistent with the existing portal UX. The Command + Popover pattern is specifically intended for entity selection where searchability matters.

3. REWORK "DESIRED SCHEDULE NOTE" INTO AN ACTUAL DATE PICKER

Current problem:
`Desired Schedule Note` is a free-text field such as "ASAP", "Next week", etc. This is difficult to use for operational planning and progress monitoring.

Required UI direction:
- Replace the current free-text schedule input with a proper calendar/date picker.
- Use the existing shadcn date-picker/calendar primitives already available in the project if present.
- The user must be able to select an actual date using a calendar.
- The calendar must support navigation across:
  - day
  - month
  - year
- The selected date must be clearly visible after selection.
- The field should have a clear business label such as "Desired Schedule" rather than "Desired Schedule Note".
- Keep the field optional because the backend field is currently optional.
- Do not invent a new backend date field.
- Do not modify the CalibrationRequest Prisma schema.
- Do not modify the CalibrationRequest API.
- Preserve compatibility with the existing API field.
- Inspect the existing shared schema/API contract first and determine the safest frontend representation of the selected date that fits the existing `desiredScheduleNote` field.
- The selected date must be converted consistently before being submitted.
- Display formatting may be human-friendly, but the payload must remain consistent and deterministic.
- Avoid introducing time-of-day functionality because the current requirement is a desired calendar date, not a scheduled appointment time.

Important:
Do not silently reintroduce free-text scheduling beside the new date picker. The goal is to move away from ambiguous text toward an actual selectable date.

4. REDESIGN DEVICE SELECTION

Current behavior:
The user enters a raw Device ID manually.

That is not sufficient.

The user must first be able to identify the actual device from the customer's device registry, including its device name.

Required UX:
- Replace manual Device ID entry with a searchable `Command` + `Popover` selector.
- The selector must allow searching and selecting from devices belonging to the selected customer.
- Do not allow arbitrary free-text Device IDs when a device picker can be used.
- Selecting a customer must determine which devices are available in the device picker.
- The device picker must clearly show the device's human-readable identity, not only its opaque ID.
- At minimum, show:
  - Device name / device type
  - Device ID
- Where the existing Device model already provides useful identifying fields such as brand, model, or serial number, display those in a compact secondary line rather than hiding them.
- The selected device should remain easy to identify after the popover closes.
- The picker must support search.

5. DEVICE CAPABILITY CONSTRAINT — IMPORTANT BUSINESS CONTEXT

The supplied government/OSS calibration standard document contains the company's assessed service capabilities. On page 4, the document explicitly lists the equipment/service categories for which PT Presisi Kalibrasi Medika has capability, including:

1. Blood Pressure Monitor
2. Humidifier
3. Baby Incubator
4. Infant Warmer
5. Pulse Oximeters
6. Oxymeter monitor
7. Radiant Warmer
8. Resuscitators (Cardiac)
9. Resuscitators (Pulmonary)
10. Sterillizer (Sterillisator)
11. Ventilator
12. Ambulatory ECG
13. Aspirators / Suction
14. Blood Bank Refrigerators
15. Cardiac Output Units
16. Electrocardiographs
17. Oxygen-Air Proportioners
18. Radiant Warmers (Adult)
19. Regulators
20. Breast Pumps
21. Electric Beds
22. Oxygen Concentrators
23. Paraffin Baths
24. Regulators (Low-Volume Suction)
25. Sphygmomanometers
26. Ultrasonic Nebulizers
27. Nebulizer Compressor
28. Oven
29. Kulkas Vaksin
30. Coald Chain
31. Bed Side Monitor
32. Patient Monitor
33. Flow meter
34. Medical Refrigerator
35. Medical Freezer

The uploaded document identifies this as the company's "DAFTAR KEMAMPUAN PELAYANAN PENGUJIAN DAN/ATAU KALIBRASI ALAT KESEHATAN". Treat this as business reference context for the device-selection UX.

CRITICAL IMPLEMENTATION CONSTRAINT:
Before implementing capability filtering, inspect the actual repository and database/domain model to determine whether the existing Device entity already has a field/category/type that can be reliably mapped to these equipment names.

Do NOT invent a new capability database, new master table, new Prisma model, or backend rule in this task.

If the existing data model already supports reliable classification:
- Use that existing classification to make the device picker prioritize/show eligible devices.
- Make the capability relationship understandable in the UI.
- Do not expose an opaque internal technical rule to the user.

If the existing data model does NOT currently provide a reliable capability classification:
- Do NOT create a new schema or backend model just to satisfy this UI request.
- Keep the device picker based on the existing customer device registry.
- Clearly flag in the Cursor final report that capability-based filtering could not safely be implemented without introducing a new business/data-model decision.

Do NOT perform fuzzy matching between arbitrary device names and the certificate list and pretend that the result is authoritative.

6. CUSTOMER → DEVICE DEPENDENCY

The device selector must be dependent on the selected customer.

Required behavior:
- No customer selected → device picker is disabled or clearly indicates that customer selection is required first.
- Customer selected → load/show only devices belonging to that customer.
- Changing customer must clear any previously selected device items that no longer belong to the new customer.
- Prevent submitting a device that does not belong to the selected customer.
- Preserve the existing backend validation and tenant/company behavior; do not duplicate backend authorization logic in the UI.

7. REPEATABLE DEVICE ITEMS

Keep support for multiple CalibrationRequest items.

For each row/item:
- Device picker using Command + Popover.
- Human-readable device name.
- Device ID.
- Optional notes.
- Clear remove action.
- Add Device action remains available.
- Prevent accidental duplicate selection of the same device where the current backend/domain rules require one device only once per request.
- Do not invent a new duplicate rule if the backend does not currently enforce it; inspect the existing schema/service first and preserve the established behavior.

8. VISUAL HIERARCHY

The revised page should feel like a serious operational transaction form.

Recommended structure within the single main card:
- Request Information
  - Customer
  - Service Mode
  - Desired Schedule
  - Notes
- Devices
  - explanatory text
  - repeated device selection rows
  - Add Device
- Footer actions
  - Cancel
  - Create Request

Do not split every field into its own card.
Do not create multiple tiny cards just to create visual sections.
Use spacing, separators, section headings, and field grouping instead.

9. ACCESSIBILITY / INTERACTION QUALITY

Ensure:
- Command search receives keyboard focus appropriately.
- Popover closes after a selection.
- Clear selected-state indication exists.
- Loading and empty states are understandable.
- Calendar keyboard navigation remains usable.
- Required fields are visibly marked.
- Validation errors are shown near the relevant field.
- The form remains usable at normal desktop zoom without excessive vertical scrolling.
- Do not create a layout that looks compact but forces users to scroll unnecessarily because fields were artificially stacked.

10. PRESERVE BACKEND CONTRACT

The currently implemented CalibrationRequest backend supports:
- POST `/calibration-requests`
- GET `/calibration-requests`
- GET `/calibration-requests/:id`
- PATCH `/calibration-requests/:id`
- POST `/calibration-requests/:id/cancel`
- POST `/calibration-requests/:id/submit`

Do not change these endpoints.
Do not change backend schemas.
Do not create frontend-only assumptions that require backend changes.

11. VERIFICATION

After implementing:
- Run the exact existing typecheck and lint commands for the portal.
- Verify the portal compiles without errors.
- Manually verify:
  1. Customer Command + Popover search.
  2. Customer selection.
  3. Device picker remains disabled before customer selection.
  4. Device Command + Popover search.
  5. Device name + Device ID are visible.
  6. Multiple devices can be added.
  7. Desired Schedule date picker supports date/month/year navigation.
  8. Date value is submitted through the existing API contract.
  9. Form width is materially wider and no longer leaves excessive horizontal blank space.
  10. Existing Create Request behavior still works.
- Confirm that no files outside the permitted Portal UI scope were modified.

12. FINAL REPORT

In your final response, explicitly report:
- Files changed.
- Which existing Command/Popover and Calendar components were reused.
- How Customer → Device dependency was implemented.
- How the existing Device data model was used to identify device names.
- Whether certificate-capability filtering could be safely implemented from existing data or had to be deferred.
- How the selected schedule date is represented in the existing API payload.
- Typecheck result.
- Lint result.
- Confirmation that `apps/api`, `packages/db`, `apps/tech-pwa`, and all other lifecycle modules were untouched.

Do not implement anything beyond the requirements above.
Do not modify backend or database merely to make the UI easier.
Do not invent business rules where the existing schema or repository does not support them.