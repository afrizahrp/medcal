/**
 * Customer-facing Indonesian messages for Better Auth failures. The server's
 * own message is English and written for developers, so it is never shown;
 * known codes map to a specific sentence and everything else to a generic one.
 */
export interface AuthErrorLike {
  status?: number;
  code?: string;
}

export const NETWORK_ERROR_MESSAGE =
  "Tidak dapat terhubung ke server. Periksa koneksi Anda, lalu coba lagi.";

export function signInErrorMessage(error: AuthErrorLike | null | undefined): string {
  if (error?.code === "INVALID_EMAIL_OR_PASSWORD" || error?.status === 401) {
    return "Email atau kata sandi salah.";
  }
  if (error?.status === 429) return "Terlalu banyak percobaan. Tunggu sebentar, lalu coba lagi.";
  if (error?.code === "EMAIL_NOT_VERIFIED") return "Email Anda belum diverifikasi.";
  return "Gagal masuk. Silakan coba lagi.";
}

export function signUpErrorMessage(error: AuthErrorLike | null | undefined): string {
  const code = error?.code ?? "";
  if (code.startsWith("USER_ALREADY_EXISTS")) return "Email ini sudah terdaftar. Silakan masuk.";
  if (code === "PASSWORD_TOO_SHORT") return "Kata sandi terlalu pendek.";
  if (code === "PASSWORD_TOO_LONG") return "Kata sandi terlalu panjang.";
  if (code === "INVALID_EMAIL") return "Format email tidak valid.";
  if (code.startsWith("REGISTRATION_") || error?.status === 403) {
    return "Email ini tidak dapat digunakan untuk mendaftar di Portal Pelanggan.";
  }
  if (error?.status === 429) return "Terlalu banyak percobaan. Tunggu sebentar, lalu coba lagi.";
  return "Pendaftaran gagal. Silakan coba lagi.";
}
