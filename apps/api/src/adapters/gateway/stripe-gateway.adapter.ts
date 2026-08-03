import { Injectable, Logger } from '@nestjs/common';
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
import { StripeAccountService } from '../../integrations/stripe-account.service.js';

const STRIPE_API_VERSION = '2025-02-24.acacia';

/**
 * StripeGatewayAdapter — real PaymentGatewayPort implementation (TDD-001 §10.2).
 *
 * Multi-tenant: there is no single Stripe account for this adapter to hold.
 * Every method resolves the calling brand's own encrypted credentials via
 * StripeAccountService and builds a fresh Stripe client from them — brand A's
 * payments are only ever created, captured, refunded or settled against
 * brand A's own Stripe account.
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

  constructor(private readonly stripeAccounts: StripeAccountService) {}

  async createIntent(input: CreateIntentInput): Promise<PaymentIntent> {
    const stripe = await this.clientFor(input.brandId);
    const paymentMethodTypes = this.paymentMethodTypesFor(input);

    try {
      const pi = await stripe.paymentIntents.create(
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
    const stripe = await this.clientFor(input.brandId);
    try {
      const pi = await stripe.paymentIntents.capture(
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
    const stripe = await this.clientFor(input.brandId);
    try {
      const refund = await stripe.refunds.create(
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

  async void(gatewayReference: string, brandId: string): Promise<PaymentIntent> {
    const stripe = await this.clientFor(brandId);
    try {
      const pi = await stripe.paymentIntents.cancel(gatewayReference);
      return this.toPaymentIntent(pi, pi.currency.toUpperCase() as CurrencyCode);
    } catch (error) {
      throw this.wrap(error, 'void');
    }
  }

  async retrieve(gatewayReference: string, brandId: string): Promise<PaymentIntent> {
    const stripe = await this.clientFor(brandId);
    try {
      const pi = await stripe.paymentIntents.retrieve(gatewayReference);
      return this.toPaymentIntent(pi, pi.currency.toUpperCase() as CurrencyCode);
    } catch (error) {
      throw this.wrap(error, 'retrieve');
    }
  }

  async verifySignature(
    payload: string | Buffer,
    headers: Readonly<Record<string, string>>,
    brandId: string | null,
  ): Promise<boolean> {
    const signature = headers['stripe-signature'] ?? headers['Stripe-Signature'];
    if (!signature || !brandId) return false;

    const credentials = await this.stripeAccounts.getCredentialsForGateway(brandId);
    if (!credentials) {
      this.logger.warn(`webhook received for brand ${brandId}, which has no Stripe account configured`);
      return false;
    }

    try {
      // A brand-scoped client purely to reuse the SDK's constructEvent — this
      // call makes no network request.
      new Stripe(credentials.secretKey, { apiVersion: STRIPE_API_VERSION }).webhooks.constructEvent(
        payload,
        signature,
        credentials.webhookSecret,
      );
      return true;
    } catch (error) {
      this.logger.warn(`stripe webhook signature rejected for brand ${brandId}: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * Called only after verifySignature has already checked the signature —
   * re-deriving the event here is just a JSON parse, not a second trust check.
   * `brandId` is accepted for interface symmetry with verifySignature; parsing
   * the already-verified payload needs no further per-brand lookup.
   */
  parseWebhook(payload: string | Buffer, _brandId: string | null): GatewayWebhookEvent {
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

  private async clientFor(brandId: string): Promise<Stripe> {
    const credentials = await this.stripeAccounts.getCredentialsForGateway(brandId);
    if (!credentials) {
      throw new IntegrationError({
        message: `Stripe is not configured for brand ${brandId}`,
        errorClass: 'VALIDATION',
        provider: this.providerName,
      });
    }
    return new Stripe(credentials.secretKey, { apiVersion: STRIPE_API_VERSION });
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
