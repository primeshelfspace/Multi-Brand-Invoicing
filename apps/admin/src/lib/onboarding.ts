import { redirect } from 'next/navigation';
import { can, type Role } from '@fenwick/shared';
import { getCurrentUser, getMerchantOnboarding, type CurrentUser } from './api';
import { LOGIN_PATH, readSessionToken } from './session';

/**
 * Onboarding, FR-ONB. The current step is never stored as its own flag — it
 * is computed live from real rows (user status, staged merchant fields,
 * brand count) every time, so it can never drift out of sync with what
 * actually happened. `null` means onboarding is complete.
 *
 * `awaiting-setup` is not a step anyone performs. It is where a user lands
 * when the merchant still owes onboarding but their own role cannot complete
 * it — see resolveOnboardingStep.
 */
export type OnboardingStep =
  | 'set-password'
  | 'company-details'
  | 'brand-structure'
  | 'multi-brand-setup'
  | 'awaiting-setup'
  | null;

/** Every brand-shaped onboarding step writes through an endpoint gated on
 * BRANDS WRITE, which FRS-001 §3.3 grants to Owner and Merchant Admin only.
 * Read off the shared matrix rather than restated here, so a matrix change
 * moves this with it. */
const BRAND_SETUP_STEPS: ReadonlySet<OnboardingStep> = new Set<OnboardingStep>([
  'company-details',
  'brand-structure',
  'multi-brand-setup',
]);

export async function resolveOnboardingStep(user: CurrentUser): Promise<OnboardingStep> {
  // Applies to every role: a user on a temporary password sets their own
  // before anything else, and is always permitted to.
  if (user.mustResetPassword) return 'set-password';

  const merchant = await getMerchantOnboarding();
  if (merchant.onboardingComplete) return null;

  const step = resolveSetupStep(merchant);

  // Sending a user to a form whose endpoint will refuse them is a dead end,
  // not a prompt: every other route bounces them back here, so they cannot
  // reach the app at all and cannot fix it themselves either. Tell them who
  // can instead.
  if (BRAND_SETUP_STEPS.has(step) && !can(user.role as Role, 'BRANDS', 'WRITE')) {
    return 'awaiting-setup';
  }
  return step;
}

/**
 * `hasBrands` is deliberately consulted before `companyDetails`. Company
 * details exist to seed a merchant's *first* brand, so asking a merchant that
 * already has brands to "create your first brand" is both wrong on its face
 * and actively harmful — single-brand structure would mint a duplicate from
 * those staged details. A merchant that already has brands only owes the
 * structure decision.
 */
function resolveSetupStep(merchant: {
  companyDetails: unknown;
  brandStructure: 'SINGLE' | 'MULTI' | null;
  hasBrands: boolean;
}): Exclude<OnboardingStep, 'set-password' | 'awaiting-setup' | null> {
  if (!merchant.brandStructure) {
    return !merchant.companyDetails && !merchant.hasBrands ? 'company-details' : 'brand-structure';
  }
  // MULTI has no brand-count shortcut to completion — see completeMultiBrandOnboarding.
  return 'multi-brand-setup';
}

export function routeForStep(step: OnboardingStep): string {
  switch (step) {
    case 'set-password':
      return '/set-password';
    case 'company-details':
      return '/brands/new';
    case 'brand-structure':
      return '/brands/structure';
    case 'multi-brand-setup':
      return '/brands/multi';
    case 'awaiting-setup':
      return '/awaiting-setup';
    case null:
      return '/';
  }
}

/**
 * The one guard every onboarding page calls. Redirects to /login if there is
 * no session at all, to the actual current step if the caller is on the
 * wrong page (skip-ahead or stale bookmark), and returns the signed-in user
 * otherwise. Never returns for a page whose step doesn't match — `redirect`
 * throws, so nothing after the call to this function runs.
 */
export async function requireOnboardingStep(
  step: Exclude<OnboardingStep, null>,
): Promise<CurrentUser> {
  const user = await requireSignedInUser(routeForStep(step));

  const actual = await resolveOnboardingStep(user);
  if (actual !== step) {
    redirect(routeForStep(actual));
  }

  return user;
}

/** Guards /brands/created specifically: reachable only once onboarding is
 * actually complete. Anyone else finding their way here (no session, or
 * onboarding still incomplete) is sent somewhere that means something. */
export async function requireOnboardingComplete(): Promise<CurrentUser> {
  const user = await requireSignedInUser('/brands/created');

  const actual = await resolveOnboardingStep(user);
  if (actual !== null) {
    redirect(routeForStep(actual));
  }

  return user;
}

/**
 * Shared by both guards above: no session at all goes to /login carrying the
 * destination it was trying to reach; a session the API will not honour goes
 * there flagged expired.
 */
async function requireSignedInUser(destination: string): Promise<CurrentUser> {
  if (!(await readSessionToken())) {
    redirect(`${LOGIN_PATH}?next=${encodeURIComponent(destination)}`);
  }
  try {
    return await getCurrentUser();
  } catch {
    redirect(`${LOGIN_PATH}?expired=1`);
  }
}
