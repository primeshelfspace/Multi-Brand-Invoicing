import { Inject, Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import {
  IntegrationError,
  type CaptureInput,
  type CreateIntentInput,
  type CurrencyCode,
  type GatewayWebhookEvent,
  type PaymentGatewayPort,
  type PaymentIntent,
  type PaymentIntentStatus,
  type RefundInput,
  type RefundResult,
} from '@fenwick/shared';
import { ENV, type Env } from '../../config/env.js';

/**
 * StripeGatewayAdapter — real PaymentGatewayPort implementation (TDD-001 §10.2).
 *
 * Card data never reaches this process: the payment page collects it via
 * Stripe Elements client-side and confirms the PaymentIntent directly against
 * Stripe using the `clientToken` (client_secret) this adapter returns. This
 * keeps the integration at PCI SAQ A rather than SAQ D. The webhook is the
 * authoritative settlement signal (NFR-INT-010) — `createIntent`'s own return
 * status is provisional (REQUIRES_ACTION/PROCESSING) until Stripe confirms.
 */
@Injectable()
export class StripeGatewayAdapter implements PaymentGatewayPort {
  readonly providerName = 'stripe';

  private readonly logger = new Logger(StripeGatewayAdapter.name);
  private client: Stripe | null = null;

  constructor(@Inject(ENV) private readonly env: Env) {}

  /**
   * Constructed lazily, not in the constructor: NestJS instantiates every
   * provider in GatewayModule regardless of which one PAYMENT_GATEWAY_DRIVER
   * actually selects, and the Stripe SDK throws synchronously on an empty
   * API key — which would crash the app under the fake/numbers drivers too.
   * By the time this is actually called, env.ts's superRefine already
   * guarantees STRIPE_SECRET_KEY is set (driver=stripe requires it).
   */
  private get stripe(): Stripe {
    this.client ??= new Stripe(this.env.STRIPE_SECRET_KEY ?? '', { apiVersion: '2025-02-24.acacia' });
    return this.client;
  }

  async createIntent(input: CreateIntentInput): Promise<PaymentIntent> {
    const paymentMethodTypes = this.paymentMethodTypesFor(input);

    try {
      const pi = await this.stripe.paymentIntents.create(
        {
          amount: input.amountMinor,
          currency: input.currency.toLowerCase(),
          description: input.description,
          payment_method_types: paymentMethodTypes,
          receipt_email: input.customer.email ?? undefined,
          metadata: {
            invoiceId: input.invoiceId,
            brandId: input.brandId,
            ...input.metadata,
          },
        },
        { idempotencyKey: input.idempotencyKey },
      );

      return this.toPaymentIntent(pi, input.currency);
    } catch (error) {
      throw this.wrap(error, 'createIntent');
    }
  }

  async capture(input: CaptureInput): Promise<PaymentIntent> {
    try {
      const pi = await this.stripe.paymentIntents.capture(
        input.gatewayReference,
        input.amountMinor === undefined ? undefined : { amount_to_capture: input.amountMinor },
        { idempotencyKey: input.idempotencyKey },
      );
      return this.toPaymentIntent(pi, pi.currency.toUpperCase() as CurrencyCode);
    } catch (error) {
      throw this.wrap(error, 'capture');
    }
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    try {
      const refund = await this.stripe.refunds.create(
        {
          payment_intent: input.gatewayReference,
          amount: input.amountMinor,
          reason: this.mapRefundReason(input.reason),
        },
        { idempotencyKey: input.idempotencyKey },
      );
      return {
        refundReference: refund.id,
        amountMinor: refund.amount,
        status: refund.status === 'succeeded' ? 'SUCCEEDED' : refund.status === 'failed' ? 'FAILED' : 'PENDING',
        occurredAt: new Date(refund.created * 1000),
      };
    } catch (error) {
      throw this.wrap(error, 'refund');
    }
  }

  async void(gatewayReference: string): Promise<PaymentIntent> {
    try {
      const pi = await this.stripe.paymentIntents.cancel(gatewayReference);
      return this.toPaymentIntent(pi, pi.currency.toUpperCase() as CurrencyCode);
    } catch (error) {
      throw this.wrap(error, 'void');
    }
  }

  async retrieve(gatewayReference: string): Promise<PaymentIntent> {
    try {
      const pi = await this.stripe.paymentIntents.retrieve(gatewayReference);
      return this.toPaymentIntent(pi, pi.currency.toUpperCase() as CurrencyCode);
    } catch (error) {
      throw this.wrap(error, 'retrieve');
    }
  }

  verifySignature(payload: string | Buffer, headers: Readonly<Record<string, string>>): boolean {
    const signature = headers['stripe-signature'] ?? headers['Stripe-Signature'];
    if (!signature || !this.env.STRIPE_WEBHOOK_SECRET) return false;

    try {
      this.stripe.webhooks.constructEvent(payload, signature, this.env.STRIPE_WEBHOOK_SECRET);
      return true;
    } catch (error) {
      this.logger.warn(`stripe webhook signature rejected: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * Called only after verifySignature has already checked the signature —
   * re-deriving the event here is just a JSON parse, not a second trust check.
   */
  parseWebhook(payload: string | Buffer): GatewayWebhookEvent {
    const event = JSON.parse(payload.toString()) as Stripe.Event;
    const object = event.data.object as Stripe.PaymentIntent | Stripe.Charge;
    const gatewayReference = 'payment_intent' in object && typeof object.payment_intent === 'string'
      ? object.payment_intent
      : object.id;

    return {
      id: event.id,
      type: this.mapEventType(event.type),
      gatewayReference,
      amountMinor: 'amount' in object ? object.amount : null,
      currency: 'currency' in object ? (object.currency.toUpperCase() as CurrencyCode) : null,
      occurredAt: new Date(event.created * 1000),
      declineReason:
        'last_payment_error' in object ? (object.last_payment_error?.message ?? null) : null,
      raw: event,
    };
  }

  private paymentMethodTypesFor(input: CreateIntentInput): string[] {
    switch (input.method) {
      case 'ACH':
        return ['us_bank_account'];
      case 'CARD':
      case 'WALLET':
        // Apple Pay / Google Pay are card-network wallets from Stripe's side —
        // the Payment Element on the client offers whichever the browser supports.
        return ['card'];
      default:
        throw new IntegrationError({
          message: `${input.method} is not a Stripe-routable payment method`,
          errorClass: 'VALIDATION',
          provider: this.providerName,
        });
    }
  }

  private toPaymentIntent(pi: Stripe.PaymentIntent, currency: CurrencyCode): PaymentIntent {
    return {
      gatewayReference: pi.id,
      status: this.mapStatus(pi),
      amountMinor: pi.amount,
      currency,
      actionUrl: null,
      clientToken: pi.client_secret,
      occurredAt: new Date(pi.created * 1000),
      declineReason: pi.last_payment_error?.message ?? null,
      raw: pi,
    };
  }

  private mapStatus(pi: Stripe.PaymentIntent): PaymentIntentStatus {
    switch (pi.status) {
      case 'succeeded':
        return 'SUCCEEDED';
      case 'processing':
        return 'PROCESSING';
      case 'canceled':
        return 'CANCELLED';
      case 'requires_payment_method':
        // A brand-new intent starts here too, with no error attached — only a
        // card that just failed carries last_payment_error, which is the only
        // way to tell "declined, try another method" from "not attempted yet".
        return pi.last_payment_error ? 'FAILED' : 'REQUIRES_ACTION';
      default:
        // requires_confirmation, requires_action, requires_capture
        return 'REQUIRES_ACTION';
    }
  }

  private mapEventType(type: Stripe.Event.Type): GatewayWebhookEvent['type'] {
    switch (type) {
      case 'payment_intent.succeeded':
        return 'PAYMENT_SUCCEEDED';
      case 'payment_intent.payment_failed':
        return 'PAYMENT_FAILED';
      case 'payment_intent.processing':
        return 'PAYMENT_PENDING';
      case 'payment_intent.canceled':
        return 'PAYMENT_CANCELLED';
      case 'charge.refunded':
        return 'REFUND_SUCCEEDED';
      default:
        return 'UNKNOWN';
    }
  }

  private mapRefundReason(reason: string | undefined): Stripe.RefundCreateParams.Reason | undefined {
    if (reason === 'duplicate' || reason === 'fraudulent' || reason === 'requested_by_customer') {
      return reason;
    }
    return undefined;
  }

  private wrap(error: unknown, operation: string): IntegrationError {
    if (error instanceof Stripe.errors.StripeError) {
      return new IntegrationError({
        message: `stripe ${operation} failed: ${error.message}`,
        errorClass: this.classify(error),
        provider: this.providerName,
        providerMessage: error.message,
        providerCode: error.code,
        httpStatus: error.statusCode,
        cause: error,
      });
    }
    return new IntegrationError({
      message: `stripe ${operation} failed`,
      errorClass: 'PERMANENT',
      provider: this.providerName,
      cause: error,
    });
  }

  private classify(error: Stripe.errors.StripeError): IntegrationError['errorClass'] {
    if (error instanceof Stripe.errors.StripeAuthenticationError) return 'AUTHENTICATION';
    if (error instanceof Stripe.errors.StripeRateLimitError) return 'TRANSIENT';
    if (error instanceof Stripe.errors.StripeConnectionError) return 'TRANSIENT';
    if (error instanceof Stripe.errors.StripeAPIError) return 'TRANSIENT';
    if (error instanceof Stripe.errors.StripeInvalidRequestError) return 'VALIDATION';
    if (error instanceof Stripe.errors.StripeCardError) return 'CONFLICT';
    return 'PERMANENT';
  }
}
