export function emailDomain(email: string): string {
  const parts = email.trim().toLowerCase().split("@");
  return parts.length === 2 ? parts[1]! : "";
}

export function isPublicEmailDomain(domain: string): boolean {
  const d = domain.toLowerCase();
  return (
    d === "gmail.com" ||
    d === "yahoo.com" ||
    d === "yahoo.co.id" ||
    d === "outlook.com" ||
    d === "hotmail.com" ||
    d === "live.com" ||
    d === "icloud.com" ||
    d === "aol.com" ||
    d === "proton.me" ||
    d === "protonmail.com"
  );
}
