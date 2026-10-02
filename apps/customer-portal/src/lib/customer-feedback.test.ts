import { describe, expect, it } from "vitest";
import { ApiError } from "@medcal/shared";
import {
  FEEDBACK_COMMENT_MAX,
  FEEDBACK_RATINGS,
  describeFeedbackSubmitError,
  feedbackPath,
  ratingStars,
} from "./customer-feedback";

describe("customer feedback client helpers", () => {
  it("offers exactly the ratings 1 to 5 and the server's comment limit", () => {
    expect([...FEEDBACK_RATINGS]).toEqual([1, 2, 3, 4, 5]);
    expect(FEEDBACK_COMMENT_MAX).toBe(2000);
  });

  it("builds the feedback path from the URL id only, encoded", () => {
    expect(feedbackPath("abc123")).toBe("/customer/work-orders/abc123/feedback");
    expect(feedbackPath("a/b?c")).toBe("/customer/work-orders/a%2Fb%3Fc/feedback");
  });

  it("renders filled and empty stars for each rating", () => {
    expect(ratingStars(5)).toBe("★★★★★");
    expect(ratingStars(1)).toBe("★☆☆☆☆");
    expect(ratingStars(3)).toBe("★★★☆☆");
    expect(ratingStars(0)).toBe("☆☆☆☆☆");
    expect(ratingStars(9)).toBe("★★★★★");
  });

  describe("describeFeedbackSubmitError", () => {
    const api = (status: number, code?: string) => new ApiError(status, "x", code ? { code } : undefined);

    it("maps the duplicate and ineligible conflicts and asks for a refetch", () => {
      expect(describeFeedbackSubmitError(api(409, "FEEDBACK_ALREADY_SUBMITTED"))).toMatchObject({
        kind: "ALREADY_SUBMITTED",
        refetch: true,
      });
      expect(describeFeedbackSubmitError(api(409, "FEEDBACK_NOT_ELIGIBLE"))).toMatchObject({
        kind: "NOT_ELIGIBLE",
        refetch: true,
      });
    });

    it("maps not found, forbidden (origin / access) and invalid input", () => {
      expect(describeFeedbackSubmitError(api(404, "WORK_ORDER_NOT_FOUND")).kind).toBe("NOT_FOUND");
      expect(describeFeedbackSubmitError(api(403, "ORIGIN_NOT_ALLOWED")).kind).toBe("FORBIDDEN");
      expect(describeFeedbackSubmitError(api(403, "CUSTOMER_ACCESS_REQUIRED")).kind).toBe("FORBIDDEN");
      expect(describeFeedbackSubmitError(api(400, "INVALID_CUSTOMER_FEEDBACK")).kind).toBe("INVALID");
    });

    it("treats an unknown 409, a 500 and a non-API error as generic and retryable", () => {
      expect(describeFeedbackSubmitError(api(409, "SOMETHING_ELSE")).kind).toBe("GENERIC");
      expect(describeFeedbackSubmitError(api(500)).kind).toBe("GENERIC");
      expect(describeFeedbackSubmitError(new TypeError("Failed to fetch")).kind).toBe("GENERIC");
    });

    it("never echoes server text into the customer-facing message", () => {
      const err = new ApiError(500, "SELECT * FROM secrets", { code: "X" });
      expect(describeFeedbackSubmitError(err).message).not.toContain("SELECT");
    });
  });
});
