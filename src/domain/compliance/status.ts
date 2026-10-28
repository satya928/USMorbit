export type ComplianceStatus = "valid" | "expiring" | "expired" | "pending_review" | "not_applicable";

export const EXPIRING_WINDOW_DAYS = 30;

export const COMPLIANCE_STATUS_LABELS: Record<ComplianceStatus, string> = {
  valid: "Valid",
  expiring: "Expiring",
  expired: "Expired",
  pending_review: "Pending review",
  not_applicable: "Not applicable",
};

/** Calendar date (YYYY-MM-DD) in UTC, offset by `days`. Compliance dates are date-only values. */
export function isoDate(d = new Date(), days = 0): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days));
  return x.toISOString().slice(0, 10);
}

/**
 * Derived status (documented precedence): not_applicable → expired → pending_review → expiring → valid.
 * Expired wins over pending review because it is the more urgent signal.
 */
export function computeComplianceStatus(
  item: { notApplicable: boolean; verificationStatus: "pending_review" | "verified"; expiryDate: string | null },
  now = new Date(),
): ComplianceStatus {
  if (item.notApplicable) return "not_applicable";
  const today = isoDate(now);
  if (item.expiryDate && item.expiryDate < today) return "expired";
  if (item.verificationStatus === "pending_review") return "pending_review";
  if (item.expiryDate && item.expiryDate <= isoDate(now, EXPIRING_WINDOW_DAYS)) return "expiring";
  return "valid";
}

export function daysUntil(dateStr: string | null, now = new Date()): number | null {
  if (!dateStr) return null;
  const target = Date.parse(`${dateStr}T00:00:00Z`);
  const today = Date.parse(`${isoDate(now)}T00:00:00Z`);
  return Math.round((target - today) / 86_400_000);
}
