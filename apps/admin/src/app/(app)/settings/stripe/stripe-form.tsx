'use client';

import { useActionState } from 'react';
import {
  saveStripeCredentialsAction,
  testStripeConnectionAction,
  type StripeFormState,
} from './actions';

const initialState: StripeFormState = {};

/**
 * Every field is required on every save — there is no partial update.
 * getStatus() never returns the secret key or webhook secret (they are never
 * sent to this app at all after saving), so there is nothing to pre-fill and
 * no partial value to diff against; a full re-paste is the only honest option.
 */
export function StripeForm({ brandId, connected }: { brandId: string; connected: boolean }) {
  const [saveState, saveAction, saving] = useActionState(saveStripeCredentialsAction, initialState);
  const [testState, testAction, testing] = useActionState(testStripeConnectionAction, initialState);

  return (
    <div className="space-y-6">
      <form action={saveAction} className="space-y-4">
        <input type="hidden" name="brandId" value={brandId} />

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink-strong">Secret key</span>
          <input
            type="password"
            name="secretKey"
            autoComplete="off"
            placeholder="sk_live_... or sk_test_..."
            required
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink-strong placeholder:text-ink-subtle focus:border-brand focus-visible:outline-none"
          />
          <span className="mt-1 block text-xs text-ink-muted">
            Never sent back to this screen once saved — required again here only if you are rotating
            it.
          </span>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink-strong">Publishable key</span>
          <input
            type="text"
            name="publishableKey"
            autoComplete="off"
            placeholder="pk_live_... or pk_test_..."
            required
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink-strong placeholder:text-ink-subtle focus:border-brand focus-visible:outline-none"
          />
          <span className="mt-1 block text-xs text-ink-muted">
            Not secret — this is what the payment page sends to the browser to load Stripe.js.
          </span>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink-strong">
            Webhook signing secret
          </span>
          <input
            type="password"
            name="webhookSecret"
            autoComplete="off"
            placeholder="whsec_..."
            required
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink-strong placeholder:text-ink-subtle focus:border-brand focus-visible:outline-none"
          />
          <span className="mt-1 block text-xs text-ink-muted">
            From this brand's own Stripe webhook endpoint configuration — each brand's Stripe
            account needs its own endpoint pointed at this brand's webhook URL.
          </span>
        </label>

        {saveState.error && (
          <div className="rounded-md bg-danger-surface p-3 text-sm text-danger">
            {saveState.error}
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-md bg-brand px-4 py-2.5 text-sm font-medium text-brand-foreground disabled:opacity-60"
        >
          {saving ? 'Saving and verifying with Stripe…' : 'Save'}
        </button>
      </form>

      {connected && (
        <form action={testAction} className="border-t border-border pt-4">
          <input type="hidden" name="brandId" value={brandId} />
          {testState.error && (
            <div className="mb-3 rounded-md bg-danger-surface p-3 text-sm text-danger">
              {testState.error}
            </div>
          )}
          <button
            type="submit"
            disabled={testing}
            className="w-full rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-ink-strong hover:bg-surface-muted disabled:opacity-60"
          >
            {testing ? 'Testing…' : 'Test connection'}
          </button>
        </form>
      )}
    </div>
  );
}
