function claimIsTrue(value: unknown): boolean {
  return value === true || value === 'true' || value === 1;
}

// Microsoft omits email_verified unless the app registration asks for it.
// xms_edov means the issuer verified the email domain. Absent claims are false.
export function microsoftEmailVerified(
  profile: Record<string, unknown> | null | undefined,
): boolean {
  if (!profile) return false;
  if (claimIsTrue(profile.email_verified)) return true;
  if (claimIsTrue(profile.xms_edov)) return true;
  return false;
}
