The following four remaining items are now decided.

1. HUMAN CHAT SCOPE

Human Live Chat is an MVP capability available to anonymous visitors on the public MedCal website.

The purpose is real human communication and lead/message capture.
There is NO AI first responder in MVP.

Anonymous visitor does NOT mean an anonymous MedCal user/account.

Do NOT create a durable anonymous Better Auth user.

Instead, use a narrowly scoped anonymous chat continuity mechanism if required, such as a signed/secure chat-session cookie that identifies the browser's active ChatSession.

The mechanism must:

- not create an IAM user;
- not become a general anonymous identity system;
- be limited to chat conversation continuity;
- be revocable/expirable;
- not be treated as authentication.

The existing "no durable anonymous user" principle remains intact.

2. SUBDOMAIN NAMING — CONFIRMED

Use the following production application topology:

kalibrasimedika.co.id
→ Public marketing/lead acquisition website.

apps.kalibrasimedika.co.id
→ Internal MedCal management application.
→ Includes management/operational modules.
→ Module visibility and authorization are controlled by RBAC/permissions.
→ Do NOT create separate subdomains per internal role or module.

portal.kalibrasimedika.co.id
→ External client portal.
→ Used by clients to monitor calibration progress and access completed calibration certificates/documents.

technician.kalibrasimedika.co.id
→ Dedicated technician-facing PWA.
→ This is a separate application surface optimized for field/mobile workflows.
→ Authentication remains shared through Better Auth.
→ Authorization remains enforced by NestJS RBAC.
→ The subdomain is NOT itself an authorization boundary.

api.kalibrasimedika.co.id
→ NestJS apps/api.
→ REST + WebSocket + Better Auth server.

kalibrasimedika.co.id
↓
Public Website

apps.kalibrasimedika.co.id
↓
Internal Management Application
├── Dashboard
├── Lead
├── Customer
├── Calibration Management
├── Finance
├── Reports
└── modul lain sesuai permission/role

portal.kalibrasimedika.co.id
↓
Client Portal
├── Progress kalibrasi
├── Status pekerjaan
├── Sertifikat
└── dokumen/client-facing information

technician.kalibrasimedika.co.id
↓
Technician PWA
├── Job yang ditugaskan
├── Work order
├── Input hasil
├── Upload laporan
└── aktivitas teknisi

api.kalibrasimedika.co.id
↓
NestJS
├── REST
├── WebSocket
└── Better Auth

Treat the exact canonical www/non-www redirect as deployment detail.

3. WEB-API PUBLIC HOSTNAME

apps/web-api does NOT require a public hostname.

It is an internal service used by apps/web server-side.

Do not expose web-api.kalibrasimedika.co.id unless a future concrete requirement requires it.

4. REVERSE PROXY

Do NOT assume MedCal owns ports 80/443.

The MedCal deployment must support integration behind an existing host-level reverse proxy if one already exists on the VPS.

The preferred operational model is:

Internet
↓
Existing/shared reverse proxy
↓
MedCal Docker Compose network
├── web
--- apps
├── portal
├── technician
└── api

If the VPS has no suitable existing reverse proxy, MedCal may own its own Caddy/Nginx instance.

This is an infrastructure deployment detail, not a reason to reopen the MedCal application architecture.

5. CONTAINERIZATION

Docker Compose is already a LOCKED MedCal architecture decision from the existing Action Plan.

Do not reopen PM2 vs Docker.

Do not migrate unrelated existing VPS projects.

MedCal remains containerized independently.

---

With these decisions, consider the BIPMED → MedCal Architecture Adoption Matrix ready to be finalized.

Before finalizing, perform one final consistency check only:

- ensure no section contradicts these decisions;
- ensure ChatSession/ChatMessage are MVP;
- ensure FCM is the push mechanism;
- ensure WhatsApp remains passive-only in MVP;
- ensure Better Auth remains in NestJS;
- ensure Express remains public-edge-only with zero DB/auth dependency;
- ensure Docker Compose remains the deployment model;
- ensure no speculative AI schema is introduced;
- ensure no Better Auth organization plugin is introduced.

Do not conduct another broad research cycle.

Do not implement code.

Do not modify source code.

Now produce the FINAL LOCKED BIPMED → MedCal Architecture Adoption Matrix.
