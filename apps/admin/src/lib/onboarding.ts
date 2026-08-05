import { redirect } from 'next/navigation';
import { getCurrentUser, getMerchantOnboarding, type CurrentUser } from './api';
import { LOGIN_PATH, readSessionToken } from './session';

/**
 * Onboarding, FR-ONB. The current step is never stored as its own flag — it
 * is computed live from real rows (user status, staged merchant fields,
 * brand count) every time, so it can never drift out of sync with what
 * actually happened. `null` means onboarding is complete.
 */
export type OnboardingStep =
  'set-password' | 'company-details' | 'brand-structure' | 'multi-brand-setup' | null;

export async function resolveOnboardingStep(user: CurrentUser): Promise<OnboardingStep> {
  if (user.mustResetPassword) return 'set-password';

  const merchant = await getMerchantOnboarding();
  if (merchant.onboardingComplete) return null;
  if (!merchant.companyDetails) return 'company-details';
  if (!merchant.brandStructure) return 'brand-structure';
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
  if (!(await readSessionToken())) {
    redirect(`${LOGIN_PATH}?next=${encodeURIComponent(routeForStep(step))}`);
  }

  let user: CurrentUser;
  try {
    user = await getCurrentUser();
  } catch {
    redirect(`${LOGIN_PATH}?expired=1`);
  }

  const actual = await resolveOnboardingStep(user);
  if (actual !== step) {
    redirect(routeForStep(actual));
  }

  return user;
}

/** Guards /brands/created specifically: reachable only once onboarding is
 * actually complete, and only right after the single-brand path just
 * created something — a `name` in the query string is that signal. Anyone
 * else finding their way here (no session, onboarding still incomplete, or
 * a stale bookmark with no name) is sent somewhere that means something. */
export async function requireOnboardingComplete(): Promise<CurrentUser> {
  if (!(await readSessionToken())) {
    redirect(`${LOGIN_PATH}?next=${encodeURIComponent('/brands/created')}`);
  }

  let user: CurrentUser;
  try {
    user = await getCurrentUser();
  } catch {
    redirect(`${LOGIN_PATH}?expired=1`);
  }

  const actual = await resolveOnboardingStep(user);
  if (actual !== null) {
    redirect(routeForStep(actual));
  }

  return user;
}
