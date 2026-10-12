import { describe, expect, it } from "vitest";
import { buildForegroundNotification } from "./foreground";

describe("buildForegroundNotification", () => {
  it("shows the generic server-provided title/body and carries only routing keys", () => {
    const result = buildForegroundNotification({
      notification: { title: "Lead baru untuk Anda", body: "Sebuah lead ditugaskan kepada Anda. Buka untuk melihat detailnya." },
      data: { type: "LEAD_ASSIGNED", leadId: "lead-1", icon: "https://evil.example.com/x.png", extra: "secret" },
    });

    expect(result).not.toBeNull();
    expect(result!.title).toBe("Lead baru untuk Anda");
    expect(result!.options.body).toBe("Sebuah lead ditugaskan kepada Anda. Buka untuk melihat detailnya.");
    expect(result!.options.data).toEqual({ type: "LEAD_ASSIGNED", leadId: "lead-1" });
    // Icon is the app's own asset, never a URL taken from the payload.
    expect(result!.options.icon).toBe("/short-logo.png");
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(JSON.stringify(result)).not.toContain("evil.example.com");
  });

  it("groups repeat notifications for the same event and lead via the tag", () => {
    const result = buildForegroundNotification({
      notification: { title: "Pesan baru", body: "b" },
      data: { type: "CONTACT_MESSAGE_NEW", leadId: "lead-2" },
    });
    expect(result!.options.tag).toBe("CONTACT_MESSAGE_NEW:lead-2");
  });

  it("drops an unsafe lead id instead of forwarding it to the service worker", () => {
    const result = buildForegroundNotification({
      notification: { title: "Pesan baru", body: "b" },
      data: { type: "CONTACT_MESSAGE_NEW", leadId: "../../admin" },
    });
    expect(result!.options.data).toEqual({ type: "CONTACT_MESSAGE_NEW", leadId: "" });
  });

  it("falls back to generic text when the notification block is missing", () => {
    const result = buildForegroundNotification({ data: { type: "CONTACT_MESSAGE_NEW", leadId: "" } });
    expect(result!.title).toBe("MedCal");
    expect(result!.options.body).toBe("Buka untuk melihat detailnya.");
  });

  it("returns null for messages that are not one of ours", () => {
    expect(buildForegroundNotification({ notification: { title: "x" }, data: { type: "OTHER" } })).toBeNull();
    expect(buildForegroundNotification({ notification: { title: "x" }, data: {} })).toBeNull();
    expect(buildForegroundNotification({ notification: { title: "x" } })).toBeNull();
  });
});
