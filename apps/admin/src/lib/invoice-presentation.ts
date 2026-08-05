/**
 * How an invoice status is rendered, in one place.
 *
 * The dashboard and the invoice list each carried their own byte-identical
 * `statusTone`, so a new status (or a change of palette) had to be applied
 * twice and would otherwise show one colour on one screen and another
 * elsewhere. The sync-activity panel's own `statusTone` is deliberately NOT
 * folded in here — it colours SyncJob states (QUEUED/RUNNING/FAILED), a
 * different vocabulary that only looks similar.
 */

/** Statuses that still owe money and are not terminal — what "open" means on
 * the dashboard's outstanding-balance tile. */
export const OPEN_INVOICE_STATUSES: ReadonlySet<string> = new Set([
  'SENT',
  'VIEWED',
  'PENDING_PAYMENT',
  'PARTIALLY_PAID',
]);

export function isOpenInvoiceStatus(status: string): boolean {
  return OPEN_INVOICE_STATUSES.has(status);
}

/** Tailwind text colour for an invoice status. */
export function invoiceStatusTone(status: string): string {
  if (status === 'PAID') return 'text-success';
  if (status === 'CANCELLED') return 'text-ink-subtle';
  if (status === 'PENDING_PAYMENT' || status === 'PARTIALLY_PAID') return 'text-warning';
  return 'text-ink-strong';
}

/** PENDING_PAYMENT -> "PENDING PAYMENT". Underscores are a wire format, not
 * something to show a person. */
export function invoiceStatusLabel(status: string): string {
  return status.replace(/_/g, ' ');
}
