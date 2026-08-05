import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import Stripe from 'stripe';
import { IntegrationError, type Scope, type StripeCredentialsInput } from '@fenwick/shared';
import { decryptCredential, encryptCredential } from '../common/credential-encryption.js';
import { ENV, type Env } from '../config/env.js';
import { PrismaService } from '../infra/prisma/prisma.service.js';

export interface StripeAccountStatus {
  readonly connected: boolean;
  /** Safe to send to the client as-is — publishable keys are not secret. */
  readonly publishableKey: string | null;
}

interface StoredStripeSecrets {
  readonly secretKey: string;
  readonly webhookSecret: string;
}

interface StripeConfig {
  readonly publishableKey: string;
}

export interface StripeGatewayCredentials {
  readonly secretKey: string;
  readonly webhookSecret: string;
  readonly publishableKey: string;
}

/**
 * Per-brand Stripe credentials, stored the same way Zoho's connection is:
 * an IntegrationConnection row (provider = 'STRIPE'), secret fields
 * envelope-encrypted, RLS-scoped by brand like every other table here.
 *
 * The secret key and webhook secret never leave this service unencrypted
 * except to be handed straight to the Stripe SDK or the webhook verifier —
 * never returned from an API response, never logged.
 */
@Injectable()
export class StripeAccountService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * Refuses to store a key that does not actually work — a typo'd secret
   * key should surface here, at save time, not on a customer's payment
   * attempt three weeks later.
   */
  async saveCredentials(
    scope: Scope,
    brandId: string,
    input: StripeCredentialsInput,
  ): Promise<void> {
    await this.testConnection(input.secretKey);

    const encrypted = encryptCredential(
      JSON.stringify({
        secretKey: input.secretKey,
        webhookSecret: input.webhookSecret,
      } satisfies StoredStripeSecrets),
      this.env.CREDENTIAL_ENCRYPTION_KEY,
    );
    const config: StripeConfig = { publishableKey: input.publishableKey };

    await this.prisma.withScope(scope, (tx) =>
      tx.integrationConnection.upsert({
        where: { brandId_provider: { brandId, provider: 'STRIPE' } },
        create: {
          brandId,
          provider: 'STRIPE',
          status: 'CONNECTED',
          encryptedCredentials: encrypted,
          config: config as unknown as Prisma.InputJsonValue,
          health: 'Verified',
        },
        update: {
          status: 'CONNECTED',
          encryptedCredentials: encrypted,
          config: config as unknown as Prisma.InputJsonValue,
          health: 'Verified',
        },
      }),
    );
  }

  /** publishableKey only — never the secret key or webhook secret. */
  async getStatus(scope: Scope, brandId: string): Promise<StripeAccountStatus> {
    const row = await this.prisma.withScope(scope, (tx) =>
      tx.integrationConnection.findUnique({
        where: { brandId_provider: { brandId, provider: 'STRIPE' } },
      }),
    );
    const config = row?.config as StripeConfig | null | undefined;
    return {
      connected: row?.status === 'CONNECTED' && Boolean(row.encryptedCredentials),
      publishableKey: config?.publishableKey ?? null,
    };
  }

  /** Re-verifies whatever is currently saved — used by the settings page's
   * standalone "Test connection" action, after the secret key field has
   * already gone blank (write-only) and there is nothing left to re-type. */
  async testStoredCredentials(scope: Scope, brandId: string): Promise<void> {
    const creds = await this.getStoredCredentialsScoped(scope, brandId);
    if (!creds) {
      throw new IntegrationError({
        message: 'Stripe is not configured for this brand yet',
        errorClass: 'VALIDATION',
        provider: 'stripe',
      });
    }
    await this.testConnection(creds.secretKey);
  }

  /** A real, cheap, read-only Stripe call — the only way to actually know a
   * key works, as opposed to merely being shaped like one. */
  async testConnection(secretKey: string): Promise<void> {
    try {
      await new Stripe(secretKey, { apiVersion: '2025-02-24.acacia' }).balance.retrieve();
    } catch (error) {
      if (error instanceof Stripe.errors.StripeAuthenticationError) {
        throw new IntegrationError({
          message: 'Stripe rejected this secret key',
          errorClass: 'AUTHENTICATION',
          provider: 'stripe',
          providerMessage: error.message,
        });
      }
      throw new IntegrationError({
        message: 'Could not reach Stripe to verify this key',
        errorClass: 'TRANSIENT',
        provider: 'stripe',
        providerMessage: error instanceof Error ? error.message : String(error),
        cause: error,
      });
    }
  }

  /**
   * The gateway's own read path: resolving a brand's Stripe credentials to
   * actually process a payment or verify a webhook. Unscoped on purpose —
   * this runs from the anonymous public payment page (no session, no
   * scope exists yet) and from Stripe's own signed webhook callback, keyed
   * strictly by a brandId the caller already resolved through *its* own
   * trusted path (an invoice row's brandId, or the brandId segment of the
   * webhook URL) — the same justification as every other withoutScope call
   * site in this codebase (see PrismaService.withoutScope).
   */
  async getCredentialsForGateway(brandId: string): Promise<StripeGatewayCredentials | null> {
    const row = await this.prisma.withoutScope(
      "resolving a brand's Stripe credentials to process a payment or verify a webhook",
      (client) =>
        client.integrationConnection.findUnique({
          where: { brandId_provider: { brandId, provider: 'STRIPE' } },
        }),
    );
    return this.decode(row);
  }

  /**
   * The public payment page's own read: which publishable key `loadStripe()`
   * should use for this brand. Deliberately never touches
   * encryptedCredentials — there is no reason to decrypt a secret key just to
   * read the one field that was never secret in the first place.
   */
  async getPublishableKeyForBrand(brandId: string): Promise<string | null> {
    const row = await this.prisma.withoutScope(
      "resolving a brand's Stripe publishable key for the public payment page",
      (client) =>
        client.integrationConnection.findUnique({
          where: { brandId_provider: { brandId, provider: 'STRIPE' } },
          select: { status: true, config: true },
        }),
    );
    if (row?.status !== 'CONNECTED') return null;
    const config = row.config as StripeConfig | null;
    return config?.publishableKey ?? null;
  }

  private async getStoredCredentialsScoped(
    scope: Scope,
    brandId: string,
  ): Promise<StripeGatewayCredentials | null> {
    const row = await this.prisma.withScope(scope, (tx) =>
      tx.integrationConnection.findUnique({
        where: { brandId_provider: { brandId, provider: 'STRIPE' } },
      }),
    );
    return this.decode(row);
  }

  private decode(
    row: { status: string; encryptedCredentials: string | null; config: unknown } | null,
  ): StripeGatewayCredentials | null {
    if (!row?.encryptedCredentials || row.status !== 'CONNECTED') return null;
    const config = row.config as StripeConfig | null;
    if (!config?.publishableKey) return null;

    const stored = JSON.parse(
      decryptCredential(row.encryptedCredentials, this.env.CREDENTIAL_ENCRYPTION_KEY),
    ) as StoredStripeSecrets;

    return {
      secretKey: stored.secretKey,
      webhookSecret: stored.webhookSecret,
      publishableKey: config.publishableKey,
    };
  }
}
