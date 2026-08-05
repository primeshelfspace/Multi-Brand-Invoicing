import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { CompanyDetailsInput, Scope, StoragePort } from '@fenwick/shared';
import { storageKeys, STORAGE_PORT } from '@fenwick/shared';
import { PrismaService } from '../infra/prisma/prisma.service.js';

export interface CompanyDetailsView {
  readonly legalName: string;
  readonly businessType: string;
  readonly phone: string | null;
  readonly email: string | null;
  readonly mailingAddress: unknown;
  readonly billingAddress: unknown;
  readonly taxId: string | null;
  readonly hasLogo: boolean;
}

export interface MerchantOnboardingState {
  readonly companyDetails: CompanyDetailsView | null;
  readonly brandStructure: 'SINGLE' | 'MULTI' | null;
  readonly hasBrands: boolean;
  readonly onboardingComplete: boolean;
}

export interface LogoUpload {
  readonly buffer: Buffer;
  readonly mimetype: string;
  readonly size: number;
}

export interface CreatedBrandSummary {
  readonly id: string;
  readonly displayName: string;
}

const MAX_LOGO_BYTES = 5 * 1024 * 1024;
const LOGO_EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/svg+xml': 'svg',
};
const LOGO_URL_TTL_SECONDS = 3600;

/**
 * Onboarding, FR-ONB (TDD-001 §onboarding — company details precede any
 * Brand). A merchant has no Brand at all until "brand structure" resolves,
 * so its company details are staged directly on the Merchant row rather than
 * invented as a placeholder Brand. Single-brand-structure copies them into
 * one real Brand at that point; multi-brand-structure carries them forward
 * as prefill for the first brand-by-brand setup screen instead.
 */
@Injectable()
export class MerchantService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
  ) {}

  async getOnboardingState(scope: Scope): Promise<MerchantOnboardingState> {
    const [merchant, brandCount] = await this.prisma.withScope(scope, (tx) =>
      Promise.all([
        tx.merchant.findUniqueOrThrow({ where: { id: scope.merchantId } }),
        tx.brand.count(),
      ]),
    );

    return {
      companyDetails: merchant.companyLegalName
        ? {
            legalName: merchant.companyLegalName,
            businessType: merchant.companyBusinessType ?? '',
            phone: merchant.companyPhone,
            email: merchant.companyEmail,
            mailingAddress: merchant.companyMailingAddress,
            billingAddress: merchant.companyBillingAddress,
            taxId: merchant.companyTaxId,
            hasLogo: merchant.companyLogoKey != null,
          }
        : null,
      brandStructure: merchant.brandStructure,
      hasBrands: brandCount > 0,
      onboardingComplete: merchant.onboardingComplete,
    };
  }

  async setCompanyDetails(scope: Scope, input: CompanyDetailsInput): Promise<void> {
    await this.prisma.withScope(scope, (tx) =>
      tx.merchant.update({
        where: { id: scope.merchantId },
        data: {
          companyLegalName: input.legalName,
          companyBusinessType: input.businessType,
          companyPhone: input.phone,
          companyEmail: input.email,
          companyMailingAddress: input.mailingAddress ?? undefined,
          companyBillingAddress: input.billingAddress ?? undefined,
          companyTaxId: input.taxId,
        },
      }),
    );
  }

  /** Same "outside any DB transaction" reasoning as BrandsService.setLogo —
   * `put` is a network call, and withScope holds a real transaction open for
   * its whole callback. */
  async setLogo(scope: Scope, file: LogoUpload): Promise<{ logoUrl: string }> {
    const extension = LOGO_EXTENSION_BY_MIME[file.mimetype];
    if (!extension) {
      throw new BadRequestException('logo must be a JPG, PNG, or SVG image');
    }
    if (file.size > MAX_LOGO_BYTES) {
      throw new BadRequestException('logo must be 5MB or smaller');
    }

    const key = storageKeys.merchantLogo(scope.merchantId, `logo.${extension}`);
    await this.storage.put({ key, body: file.buffer, contentType: file.mimetype, encrypt: true });

    await this.prisma.withScope(scope, (tx) =>
      tx.merchant.update({ where: { id: scope.merchantId }, data: { companyLogoKey: key } }),
    );

    const logoUrl = await this.storage.getSignedUrl(key, {
      expiresInSeconds: LOGO_URL_TTL_SECONDS,
    });
    return { logoUrl };
  }

  /**
   * SINGLE copies the staged company details straight into one new Brand —
   * the whole reason those details were staged on Merchant in the first
   * place rather than requiring the same form twice. MULTI just records the
   * choice; brand-by-brand setup happens on its own screen from here.
   *
   * Idempotent by construction: a repeat call — a double-click before the
   * button's disabled state lands, a browser retry on a slow connection, a
   * replayed request — must not create a second brand or re-derive a
   * decision that has already happened. The page guard (requireOnboardingStep)
   * keeps the form itself from being resubmitted through the UI, but this is
   * the layer that actually holds if that guard is ever bypassed.
   */
  async chooseBrandStructure(
    scope: Scope,
    structure: 'SINGLE' | 'MULTI',
  ): Promise<CreatedBrandSummary | null> {
    return this.prisma.withScope(scope, async (tx) => {
      const merchant = await tx.merchant.findUniqueOrThrow({ where: { id: scope.merchantId } });

      if (merchant.brandStructure === 'SINGLE') {
        const brand = await tx.brand.findFirst({
          where: { merchantId: scope.merchantId },
          orderBy: { createdAt: 'asc' },
        });
        return brand ? { id: brand.id, displayName: brand.displayName } : null;
      }
      if (merchant.brandStructure === 'MULTI') {
        return null;
      }

      if (structure === 'MULTI') {
        await tx.merchant.update({ where: { id: scope.merchantId }, data: { brandStructure: 'MULTI' } });
        return null;
      }

      if (!merchant.companyLegalName || !merchant.companyBusinessType) {
        throw new BadRequestException('company details must be completed before choosing single brand');
      }

      const brand = await tx.brand.create({
        data: {
          merchantId: scope.merchantId,
          legalName: merchant.companyLegalName,
          displayName: merchant.companyLegalName,
          businessType: merchant.companyBusinessType,
          phone: merchant.companyPhone,
          email: merchant.companyEmail,
          mailingAddress: merchant.companyMailingAddress ?? undefined,
          billingAddress: merchant.companyBillingAddress ?? undefined,
          taxId: merchant.companyTaxId,
          logoKey: merchant.companyLogoKey,
          currency: 'USD',
          timezone: 'America/New_York',
          themeColor: '#2D6A6A',
          settings: { create: { invoicePrefix: 'INV' } },
        },
      });

      // Nothing else to configure for a single-brand merchant — the
      // structure choice and the brand it produces are the whole of
      // onboarding, so completion is immediate, not a separate step.
      await tx.merchant.update({
        where: { id: scope.merchantId },
        data: { brandStructure: 'SINGLE', onboardingComplete: true },
      });

      return { id: brand.id, displayName: brand.displayName };
    });
  }

  /**
   * MULTI's own "I'm done adding brands" action — the one onboarding fact
   * that genuinely cannot be derived from data, since nothing implies how
   * many brands a merchant intended to add.
   */
  async completeOnboarding(scope: Scope): Promise<void> {
    await this.prisma.withScope(scope, async (tx) => {
      const [merchant, brandCount] = await Promise.all([
        tx.merchant.findUniqueOrThrow({ where: { id: scope.merchantId } }),
        tx.brand.count(),
      ]);
      if (merchant.brandStructure !== 'MULTI') {
        throw new BadRequestException('onboarding is not in multi-brand setup');
      }
      if (brandCount < 1) {
        throw new BadRequestException('add at least one brand before finishing setup');
      }

      await tx.merchant.update({
        where: { id: scope.merchantId },
        data: { onboardingComplete: true },
      });
    });
  }
}
