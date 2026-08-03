'use server';

import { redirect } from 'next/navigation';
import { ApiError, saveStripeCredentials, testStripeConnection } from '@/lib/api';

export interface StripeFormState {
  readonly error?: string;
}

export async function saveStripeCredentialsAction(
  _prevState: StripeFormState,
  formData: FormData,
): Promise<StripeFormState> {
  const brandId = formData.get('brandId');
  if (typeof brandId !== 'string' || !brandId) return { error: 'No brand selected.' };

  const secretKey = String(formData.get('secretKey') ?? '').trim();
  const publishableKey = String(formData.get('publishableKey') ?? '').trim();
  const webhookSecret = String(formData.get('webhookSecret') ?? '').trim();

  if (!secretKey || !publishableKey || !webhookSecret) {
    return { error: 'All three fields are required.' };
  }

  try {
    // The API itself calls Stripe to confirm the secret key actually works
    // before it ever gets encrypted and stored — a typo surfaces here, not on
    // a customer's payment attempt later.
    await saveStripeCredentials(brandId, { secretKey, publishableKey, webhookSecret });
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    return { error: error instanceof Error ? error.message : 'Could not save these credentials.' };
  }

  redirect(`/settings/payment-methods?brandId=${brandId}&stripeSaved=1`);
}

export async function testStripeConnectionAction(
  _prevState: StripeFormState,
  formData: FormData,
): Promise<StripeFormState> {
  const brandId = formData.get('brandId');
  if (typeof brandId !== 'string' || !brandId) return { error: 'No brand selected.' };

  try {
    await testStripeConnection(brandId);
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    return { error: error instanceof Error ? error.message : 'Could not test this connection.' };
  }

  redirect(`/settings/payment-methods?brandId=${brandId}&stripeTested=1`);
}
