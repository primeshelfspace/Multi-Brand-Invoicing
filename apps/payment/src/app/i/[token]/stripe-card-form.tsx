'use client';

import { useMemo, useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';

/**
 * Card data is entered directly into Stripe's own iframe (PaymentElement) and
 * confirmed straight against Stripe from the browser — this component and the
 * rest of this app never see a card number, and the client_secret below is the
 * only thing standing between "form" and "money moved" (TDD-001 §10.2).
 */
const publishableKey = process.env['NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'];
const stripePromise = publishableKey ? loadStripe(publishableKey) : null;

export function StripeCardForm({
  clientSecret,
  returnUrl,
  onSucceeded,
  onFailed,
  onCancel,
}: {
  clientSecret: string;
  returnUrl: string;
  onSucceeded: () => void;
  onFailed: (reason: string | null) => void;
  onCancel: () => void;
}) {
  if (!stripePromise) {
    return (
      <div className="mt-6 rounded-md bg-danger-surface p-4 text-center text-sm text-danger">
        Card payments are not configured (missing NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY).
      </div>
    );
  }

  return (
    <Elements stripe={stripePromise} options={{ clientSecret }}>
      <CardFormInner returnUrl={returnUrl} onSucceeded={onSucceeded} onFailed={onFailed} onCancel={onCancel} />
    </Elements>
  );
}

function CardFormInner({
  returnUrl,
  onSucceeded,
  onFailed,
  onCancel,
}: {
  returnUrl: string;
  onSucceeded: () => void;
  onFailed: (reason: string | null) => void;
  onCancel: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!stripe || !elements) return;

    setSubmitting(true);
    setError(null);

    // redirect: 'if_required' keeps the customer on this page for the common
    // case (card, no 3DS challenge); Stripe still redirects when a method
    // genuinely requires it (e.g. certain bank redirect flows).
    const result = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl },
      redirect: 'if_required',
    });

    if (result.error) {
      setSubmitting(false);
      // A declined card lands here as an error on the confirm call itself,
      // not as a webhook — there is nothing pending server-side to wait for.
      if (result.error.type === 'card_error' || result.error.type === 'validation_error') {
        onFailed(result.error.message ?? null);
      } else {
        setError(result.error.message ?? 'Something went wrong.');
      }
      return;
    }

    const status = result.paymentIntent?.status;
    if (status === 'succeeded') onSucceeded();
    else onFailed(null); // requires_action et al already redirected away, or is genuinely still pending
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6">
      <PaymentElement />
      {error && <p className="mt-3 text-xs text-danger">{error}</p>}
      <button
        type="submit"
        disabled={!stripe || submitting}
        className="mt-4 w-full rounded-md bg-brand px-4 py-2.5 text-sm font-medium text-brand-foreground disabled:opacity-60"
      >
        {submitting ? 'Processing…' : 'Pay'}
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={submitting}
        className="mt-2 w-full text-center text-xs text-ink-muted"
      >
        Back
      </button>
    </form>
  );
}
