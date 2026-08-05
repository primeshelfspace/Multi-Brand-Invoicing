'use client';

import { useActionState } from 'react';
import { disconnectStripeAction, type StripeFormState } from './actions';

const initialState: StripeFormState = {};

/**
 * Stripe Connect: one button, no credentials.
 *
 * The connect control is an anchor rather than a form, because the API responds
 * to it with a redirect to Stripe's own consent screen — a fetch could not
 * follow that cross-origin, and the browser has to make the journey itself for
 * the user to sign into Stripe at all.
 */
export function StripeForm({
  brandId,
  connected,
  connectUrl,
  displayName,
  accountId,
  chargesEnabled,
}: {
  brandId: string;
  connected: boolean;
  connectUrl: string;
  displayName: string | null;
  accountId: string | null;
  chargesEnabled: boolean;
}) {
  const [disconnectState, disconnectAction, disconnecting] = useActionState(
    disconnectStripeAction,
    initialState,
  );

  if (!connected) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-ink-muted">
          Connect this brand&rsquo;s Stripe account to accept card payments. You&rsquo;ll sign in to
          Stripe and authorise this platform — there are no API keys to copy, and you can revoke
          access from your Stripe dashboard at any time.
        </p>
        <a
          href={connectUrl}
          className="inline-flex w-full items-center justify-center rounded-md bg-brand px-4 py-2.5 text-sm font-medium text-brand-foreground"
        >
          Connect with Stripe
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-ink-muted">Account</dt>
          <dd className="text-right font-medium text-ink-strong">{displayName ?? 'Connected'}</dd>
        </div>
        {accountId && (
          <div className="flex justify-between gap-4">
            <dt className="text-ink-muted">Account ID</dt>
            <dd className="text-right font-mono text-xs text-ink-muted">{accountId}</dd>
          </div>
        )}
      </dl>

      {/* Linked but not yet able to charge is a real and common state — Stripe
          often still wants business details after the OAuth redirect finishes,
          and card payments fail until it has them. Saying so here beats a
          customer discovering it at checkout. */}
      {!chargesEnabled && (
        <div className="rounded-md bg-warning-surface p-3 text-sm text-warning">
          Stripe still needs more details before this account can accept payments. Finish the
          remaining steps in your Stripe dashboard.
        </div>
      )}

      {disconnectState.error && (
        <div className="rounded-md bg-danger-surface p-3 text-sm text-danger">
          {disconnectState.error}
        </div>
      )}

      <form action={disconnectAction}>
        <input type="hidden" name="brandId" value={brandId} />
        <button
          type="submit"
          disabled={disconnecting}
          className="w-full rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-ink-strong hover:bg-surface-muted disabled:opacity-60"
        >
          {disconnecting ? 'Disconnecting…' : 'Disconnect'}
        </button>
      </form>
    </div>
  );
}
