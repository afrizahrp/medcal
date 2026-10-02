import { describe, expect, it } from "vitest";
import { signInErrorMessage, signUpErrorMessage } from "./auth-messages";

describe("signInErrorMessage", () => {
  it("maps wrong credentials to Indonesian instead of the server's English text", () => {
    expect(signInErrorMessage({ status: 401, code: "INVALID_EMAIL_OR_PASSWORD" })).toBe(
      "Email atau kata sandi salah.",
    );
  });

  it("explains rate limiting and falls back to a generic message without leaking technical text", () => {
    expect(signInErrorMessage({ status: 429 })).toMatch(/Terlalu banyak percobaan/);
    expect(signInErrorMessage({ status: 500 })).toBe("Gagal masuk. Silakan coba lagi.");
    expect(signInErrorMessage(null)).toBe("Gagal masuk. Silakan coba lagi.");
  });
});

describe("signUpErrorMessage", () => {
  it("maps the known registration failures", () => {
    expect(signUpErrorMessage({ code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" })).toMatch(/sudah terdaftar/);
    expect(signUpErrorMessage({ code: "USER_ALREADY_EXISTS" })).toMatch(/sudah terdaftar/);
    expect(signUpErrorMessage({ code: "PASSWORD_TOO_SHORT" })).toBe("Kata sandi terlalu pendek.");
    expect(signUpErrorMessage({ code: "INVALID_EMAIL" })).toBe("Format email tidak valid.");
    expect(signUpErrorMessage({ status: 403, code: "REGISTRATION_DOMAIN_NOT_ALLOWED" })).toMatch(
      /tidak dapat digunakan/,
    );
  });

  it("falls back to a generic message", () => {
    expect(signUpErrorMessage({ status: 500 })).toBe("Pendaftaran gagal. Silakan coba lagi.");
    expect(signUpErrorMessage(undefined)).toBe("Pendaftaran gagal. Silakan coba lagi.");
  });
});
