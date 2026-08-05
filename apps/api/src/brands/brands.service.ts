import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Brand } from '@prisma/client';
import type { BrandInput, Scope, StoragePort } from '@fenwick/shared';
import { isPublicScope, storageKeys, STORAGE_PORT } from '@fenwick/shared';
import { PrismaService } from '../infra/prisma/prisma.service.js';

export interface CreateBrandInput extends BrandInput {
  readonly invoicePrefix: string;
}

export interface LogoUpload {
  readonly buffer: Buffer;
  readonly mimetype: string;
  readonly size: number;
}

const MAX_LOGO_BYTES = 5 * 1024 * 1024;

const LOGO_EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/svg+xml': 'svg',
};

const LOGO_URL_TTL_SECONDS = 3600;

export type BrandWithLogo = Brand & { readonly logoUrl: string | null };

/**
 * List is gated on BRANDS READ (FRS-001 §3.3: Owner and Merchant Admin only)
 * rather than a lighter "my assignments" read — that is a distinct
 * permission from "list every brand in the organisation" and deserves its
 * own resource/decision, not a quiet loosening of BRANDS; see the note left
 * for the reader in brands.controller.ts.
 *
 * Create always targets the calling user's own merchant — a brand has no
 * meaning outside the tenant that owns it, and nothing in this app lets one
 * merchant create a brand for another.
 */
@Injectable()
export class BrandsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
  ) {}

  async list(scope: Scope): Promise<BrandWithLogo[]> {
    const brands = await this.prisma.withScope(scope, (tx) =>
      tx.brand.findMany({ orderBy: { createdAt: 'asc' } }),
    );
    // Signed, not the raw key — logoKey is a storage-internal detail, and a
    // brand created straight from single-brand onboarding carries one across
    // from the staged company details before anyone has visited brand
    // settings, so this has to hold from the very first render, not just
    // after an explicit re-upload.
    return Promise.all(brands.map((brand) => this.withLogoUrl(brand)));
  }

  private async withLogoUrl(brand: Brand): Promise<BrandWithLogo> {
    if (!brand.logoKey) return { ...brand, logoUrl: null };
    const logoUrl = await this.storage.getSignedUrl(brand.logoKey, {
      expiresInSeconds: LOGO_URL_TTL_SECONDS,
    });
    return { ...brand, logoUrl };
  }

  async create(scope: Scope, input: CreateBrandInput): Promise<Brand> {
    // A public (token-scoped) caller has no merchantId of its own to create
    // a brand under — this endpoint is never reachable that way today, but
    // the narrowing makes the invariant explicit rather than assumed.
    if (isPublicScope(scope)) {
      throw new Error('brand creation requires an authenticated merchant scope');
    }
    const { invoicePrefix, ...brandFields } = input;

    return this.prisma.withScope(scope, (tx) =>
      tx.brand.create({
        data: {
          merchantId: scope.merchantId,
          legalName: brandFields.legalName,
          displayName: brandFields.displayName,
          businessType: brandFields.businessType,
          salesPerson: brandFields.salesPersonName,
          phone: brandFields.phone,
          email: brandFields.email,
          mailingAddress: brandFields.mailingAddress ?? undefined,
          billingAddress: brandFields.billingAddress ?? undefined,
          taxId: brandFields.taxId,
          currency: brandFields.currency,
          timezone: brandFields.timezone,
          themeColor: brandFields.themeColor,
          settings: { create: { invoicePrefix } },
        },
      }),
    );
  }

  /**
   * Uploaded outside any DB transaction on purpose: `put` is a network call
   * to S3 (or local disk), and `withScope` holds a real Postgres transaction
   * open for its whole callback — nothing external belongs inside that.
   */
  async setLogo(scope: Scope, brandId: string, file: LogoUpload): Promise<{ logoUrl: string }> {
    const extension = LOGO_EXTENSION_BY_MIME[file.mimetype];
    if (!extension) {
      throw new BadRequestException('logo must be a JPG, PNG, or SVG image');
    }
    if (file.size > MAX_LOGO_BYTES) {
      throw new BadRequestException('logo must be 5MB or smaller');
    }

    const existing = await this.prisma.withScope(scope, (tx) =>
      tx.brand.findUnique({ where: { id: brandId } }),
    );
    if (!existing) throw new NotFoundException('brand not found');

    const key = storageKeys.brandLogo(brandId, `logo.${extension}`);
    await this.storage.put({ key, body: file.buffer, contentType: file.mimetype, encrypt: true });

    await this.prisma.withScope(scope, (tx) =>
      tx.brand.update({ where: { id: brandId }, data: { logoKey: key } }),
    );

    const logoUrl = await this.storage.getSignedUrl(key, {
      expiresInSeconds: LOGO_URL_TTL_SECONDS,
    });
    return { logoUrl };
  }
}
