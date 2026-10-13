# Medcal FCM Integration — Comprehensive Architecture Audit & Implementation Plan

## Role

Act as a senior software architect and implementation auditor working on the existing Medcal codebase.

Your task is to investigate the current architecture and prepare a production-oriented implementation plan for Firebase Cloud Messaging (FCM), starting with the **management portal** and subsequently extending to **tech-pwa**.

This is an audit and planning task only. Do not implement the integration yet.

## 1. Non-Negotiable Rules

1. Inspect the actual repository before making architectural recommendations.
2. Treat the existing codebase, established conventions, current deployment topology, and existing business workflows as the source of truth.
3. Do not assume the framework, directory structure, authentication mechanism, frontend architecture, or service-worker implementation. Discover them first.
4. Do not introduce a new architectural pattern, state-management library, dependency, queue, database table, or infrastructure component without demonstrating why it is necessary.
5. Do not modify application code, database schema, migrations, environment files, dependency manifests, lockfiles, deployment configuration, or production data.
6. Do not install packages, run database migrations, deploy services, send test notifications to real users, or access production secrets.
7. Do not commit, push, or create a pull request.
8. Never expose or copy secret values into audit reports. Inspect only variable names, configuration structure, and safe metadata.
9. Distinguish verified findings from assumptions and recommendations. Reference actual file paths and relevant symbols wherever possible.
10. Do not silently expand the scope into unrelated refactoring, RBAC redesign, or a general notification-center project.

If a critical architectural question cannot be answered from the repository, document the gap and the evidence needed to resolve it.

## 2. Establish the Current System Architecture

Inspect the repository and document:

- Applications, packages, and shared modules.
- Backend framework, application entry points, API structure, and authentication middleware.
- Management portal framework and its API-client conventions.
- Tech-pwa framework, manifest, service-worker registration, build configuration, and deployment base path.
- Existing notification, event, background-job, messaging, and email mechanisms.
- Database conventions, relevant models, migrations, indexes, and lifecycle management.
- Existing environment-variable conventions and separation between server-only and client-exposed configuration.
- Existing testing strategy, linting, type checking, and build commands.
- Relevant deployment topology, origins, reverse-proxy configuration, and HTTPS assumptions, where represented in the repository.

Identify which applications share the same backend and which require separate integration work.

Do not infer that two applications share runtime state merely because they exist in the same repository.

## 3. Define the Intended FCM Scope

The target rollout order is:

1. Management portal.
2. Tech-pwa.

Evaluate how to build a reusable notification foundation without prematurely implementing every possible Medcal notification channel or recipient.

Explicitly distinguish:

- FCM transport and token management.
- Business-event generation.
- Recipient and device resolution.
- Notification content and deep-link routing.
- Client-side notification permission and subscription lifecycle.
- User-facing notification preferences, if required by existing product requirements.
- Delivery attempts, failures, retries, and observability.
- An in-app notification inbox, which is a separate capability and must not be assumed to be included.

Identify the smallest useful initial release and clearly list what is out of scope.

## 4. Audit Firebase and Web Push Requirements

Determine the appropriate implementation for the actual applications and deployment model.

Investigate:

- Whether a Firebase project already exists or its configuration is documented.
- Firebase Web SDK compatibility with the existing frontend stack.
- Firebase Admin SDK compatibility with the backend.
- Required public Firebase configuration versus server-side credentials.
- VAPID public-key configuration and its relationship to web push.
- HTTPS, browser support, permission handling, and secure-context requirements.
- Service-worker ownership, registration scope, update behavior, and potential conflicts with existing PWA caching or offline functionality.
- Foreground messages, background messages, notification clicks, and application deep links.
- Behavior when permission is denied, unsupported, or revoked.
- Behavior across multiple browsers, devices, and application sessions.
- Token refresh, token replacement, logout, expired tokens, and stale-token cleanup.

Do not assume that a successful API response means a notification was displayed or read.

Do not assume that a service worker can be replaced or merged without affecting existing PWA functionality.

## 5. Audit Backend Design and Security

Recommend a design consistent with the existing backend.

Evaluate:

- Whether an FCM provider abstraction is justified.
- How server-side Firebase initialization should be managed.
- How device tokens should be associated with authenticated users and application contexts.
- Whether management portal and tech-pwa require separate application identifiers, token records, or subscription contexts.
- How token registration and removal endpoints should be authenticated and authorized.
- How to prevent one user from registering, deleting, or targeting another user's tokens.
- Whether endpoint abuse controls, rate limits, validation, and duplicate-registration handling are required.
- How to avoid exposing credentials, service-account material, or privileged Firebase operations to browser clients.
- How notification payloads should avoid unnecessary customer, patient, calibration, or other sensitive business data.
- How the system should handle invalid tokens, provider errors, transient failures, and permanent failures.

Do not introduce new RBAC roles or redesign the authorization model. Reuse the existing authorization model and identify only the minimum permissions needed for the intended functionality.

Do not design a general-purpose notification framework unless the current architecture and verified requirements justify it.

## 6. Identify Appropriate Medcal Business Events

Inspect actual business workflows and identify potential notification triggers relevant to the management portal and tech-pwa.

For each candidate event, document:

- The source workflow and actual triggering point.
- The intended recipient and how that recipient is resolved.
- Whether the event is authoritative and transactionally reliable.
- Whether the notification is useful immediately or can be deferred.
- Duplicate-delivery and retry considerations.
- The destination URL and authorization checks required when the user opens it.
- Whether the event is appropriate for the first release or should be deferred.

Do not invent business events or notification requirements that cannot be grounded in existing code or documented project requirements.

Clearly label unconfirmed product decisions as open questions.

## 7. Reliability and Delivery Semantics

Evaluate delivery architecture in the context of actual project scale and infrastructure.

Consider:

- Whether synchronous dispatch is sufficient for the first release.
- Whether the existing background-job mechanism should be reused.
- Whether a transactional outbox is necessary to prevent loss of events after database commits.
- Idempotency and duplicate-notification prevention.
- Retry policy, backoff, and dead-letter handling where justified.
- Token cleanup and delivery-result tracking.
- Logging, metrics, diagnostics, and operational troubleshooting.

Do not automatically introduce Redis, a message broker, a new queue, or an outbox table. Recommend additional infrastructure only when supported by identified failure modes and requirements.

## 8. Frontend UX and State Management

Inspect the existing frontend architecture before recommending implementation details.

Evaluate:

- A clear opt-in flow for browser notification permission.
- Whether permission should be requested following an explicit user action rather than immediately on page load.
- Loading, unsupported-browser, denied-permission, registration-failure, and success states.
- Duplicate listeners and subscription cleanup.
- Foreground notification presentation.
- Background notification display.
- Notification-click navigation and authenticated destination handling.
- Multi-tab behavior and repeated initialization.
- Compatibility with the existing UI component system and state-management conventions.

Do not introduce Zustand or another state-management library solely for FCM. Explain whether the current state-management approach is sufficient.

Do not confuse browser push notifications with an in-app notification center.

## 9. Testing and Acceptance Criteria

Design a practical test matrix covering:

- Authenticated token registration.
- Unauthorized registration and token deletion attempts.
- Repeated registration and token refresh.
- Logout and account switching.
- Permission granted, denied, and unsupported states.
- Foreground and background delivery.
- Notification-click navigation.
- Expired and invalid tokens.
- Provider failures and retry behavior.
- Duplicate events and concurrent requests.
- Multiple devices and browsers.
- Existing PWA caching, offline behavior, and service-worker updates.
- Existing application regression tests.

Separate automated tests from tests requiring Firebase credentials, HTTPS, browser interaction, or real devices.

Define objective acceptance criteria for each rollout stage.

## 10. Required Deliverables

Create an audit report and an implementation plan under an appropriate existing documentation directory. Prefer established repository conventions; do not create a new documentation hierarchy unnecessarily.

### A. Architecture Audit Report

Include:

1. Executive summary.
2. Verified current architecture.
3. Relevant file paths and evidence.
4. Existing capabilities that can be reused.
5. Architectural constraints and integration risks.
6. Security and privacy considerations.
7. Open questions and missing prerequisites.
8. Explicit non-goals.

### B. FCM Implementation Plan

Include:

1. Recommended target architecture and message flow.
2. Proposed data model and API contracts, only where justified.
3. Firebase configuration requirements.
4. Ordered implementation phases.
5. Exact modules or files likely to change, where identifiable.
6. Portal management implementation.
7. Validation gates before proceeding to tech-pwa.
8. Tech-pwa implementation.
9. Test strategy and acceptance criteria.
10. Deployment and rollback considerations.
11. Dependencies, risks, and unresolved decisions.

Include Mermaid diagrams if they clarify the actual proposed architecture.

Every major design decision must include its rationale and relevant alternatives. Clearly distinguish existing verified capabilities from proposed changes.

## 11. Execution Boundaries

During this task:

- Read and inspect the code.
- Run safe, non-mutating inspection commands when appropriate.
- Write only the audit report and implementation-plan documents.
- Do not implement FCM.
- Do not change application code or configuration.
- Do not commit or push.

If the repository is dirty or contains unrelated work, preserve it and do not overwrite or revert anything.

## 12. Final Response

Report:

- What was inspected.
- The actual current architecture relevant to FCM.
- The recommended integration design and rollout order.
- Major risks and unresolved questions.
- Paths to the generated audit report and implementation plan.
- Confirmation that application code, configuration, dependencies, and database schema were not changed.

Be precise. Do not claim a finding was verified unless repository evidence supports it.

Stop after completing the audit and implementation plan. Wait for explicit approval before implementation.
