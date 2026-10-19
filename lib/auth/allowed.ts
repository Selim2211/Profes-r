// Parses the comma separated ALLOWED_EMAILS list and checks an address against it.
export function parseAllowedEmails(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowedEmail(
  email: string,
  raw: string | undefined = process.env.ALLOWED_EMAILS,
): boolean {
  return parseAllowedEmails(raw).includes(email.trim().toLowerCase());
}
