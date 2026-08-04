/** FR-BRD onboarding: legal structure of the business behind a brand. */

export const BUSINESS_TYPES = [
  'SOLE_PROPRIETORSHIP',
  'LLC',
  'CORPORATION',
  'PARTNERSHIP',
  'NONPROFIT',
] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];

export const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  SOLE_PROPRIETORSHIP: 'Sole Proprietorship',
  LLC: 'LLC',
  CORPORATION: 'Corporation',
  PARTNERSHIP: 'Partnership',
  NONPROFIT: 'Nonprofit',
};
