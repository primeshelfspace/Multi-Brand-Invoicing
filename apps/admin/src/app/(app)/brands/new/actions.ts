'use server';

import { redirect } from 'next/navigation';
import { ApiError, createBrand, type BrandFormInput, type CustomerAddress } from '@/lib/api';

export interface CreateBrandState {
  readonly error?: string;
}

function emptyToNull(value: FormDataEntryValue | null): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function describeApiError(error: ApiError): string {
  const body = error.body as { issues?: Array<{ path: string; message: string }> } | null;
  if (body?.issues?.length) {
    return body.issues.map((issue) => (issue.path ? `${issue.path}: ${issue.message}` : issue.message)).join(' · ');
  }
  return error.message;
}

/** Null unless at least one field was actually filled in — an address object
 * of all-nulls is not meaningfully different from no address at all, and
 * schemas elsewhere already treat "no address" as null, not an empty shell. */
function addressFromForm(formData: FormData, prefix: string): CustomerAddress | null {
  const address: CustomerAddress = {
    line1: emptyToNull(formData.get(`${prefix}Line1`)),
    line2: emptyToNull(formData.get(`${prefix}Line2`)),
    city: emptyToNull(formData.get(`${prefix}City`)),
    region: emptyToNull(formData.get(`${prefix}Region`)),
    postalCode: emptyToNull(formData.get(`${prefix}PostalCode`)),
    country: emptyToNull(formData.get(`${prefix}Country`)),
  };
  return Object.values(address).some((v) => v !== null) ? address : null;
}

export async function createBrandAction(
  _prevState: CreateBrandState,
  formData: FormData,
): Promise<CreateBrandState> {
  const legalName = emptyToNull(formData.get('legalName'));
  const invoicePrefix = emptyToNull(formData.get('invoicePrefix'));

  if (!legalName) return { error: 'Legal name is required.' };
  if (!invoicePrefix) return { error: 'Invoice prefix is required.' };

  const mailingAddress = addressFromForm(formData, 'mailing');

  const input: BrandFormInput = {
    legalName,
    // Not a separate field on this simplified form — the legal name is what
    // customers see until someone sets a different display name later.
    displayName: legalName,
    salesPersonName: emptyToNull(formData.get('salesPersonName')),
    phone: emptyToNull(formData.get('phone')),
    email: emptyToNull(formData.get('email')),
    mailingAddress,
    billingAddress: mailingAddress,
    taxId: null,
    currency: emptyToNull(formData.get('currency')) ?? 'USD',
    timezone: emptyToNull(formData.get('timezone')) ?? 'America/New_York',
    themeColor: emptyToNull(formData.get('themeColor')) ?? '#2D6A6A',
    invoicePrefix: invoicePrefix.toUpperCase(),
  };

  let created;
  try {
    created = await createBrand(input);
  } catch (error) {
    if (error instanceof ApiError) return { error: describeApiError(error) };
    return { error: error instanceof Error ? error.message : 'Could not create this brand.' };
  }

  redirect(`/?brandId=${created.id}&brandCreated=1`);
}
