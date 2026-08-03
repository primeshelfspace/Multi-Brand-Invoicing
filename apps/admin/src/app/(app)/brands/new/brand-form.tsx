'use client';

import { useActionState } from 'react';
import { ChevronDown } from 'lucide-react';
import { createBrandAction, type CreateBrandState } from './actions';

const initialState: CreateBrandState = {};

const inputClass =
  'w-full rounded-md border border-border bg-surface px-3 py-2.5 text-sm text-ink-strong placeholder:text-ink-subtle focus:border-ink-strong focus-visible:outline-none';
const labelClass = 'mb-1.5 block text-sm font-medium text-ink-strong';
const selectClass = `${inputClass} appearance-none pr-9`;

function Select({
  name,
  defaultValue,
  children,
}: {
  name: string;
  defaultValue: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <select name={name} defaultValue={defaultValue} className={selectClass}>
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle"
        aria-hidden
      />
    </div>
  );
}

/** Fifty states plus DC — enough to be a real dropdown, not a token gesture. */
const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA',
  'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM',
  'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA',
  'WV', 'WI', 'WY',
];

const COUNTRIES = ['United States', 'Canada', 'United Kingdom', 'Australia'];

/** Not shown on this simplified onboarding form — a sensible fixed default a
 * merchant can change later from Settings once they actually need to. */
const DEFAULT_INVOICE_PREFIX = 'INV';
const DEFAULT_CURRENCY = 'USD';
const DEFAULT_TIMEZONE = 'America/New_York';
const DEFAULT_THEME_COLOUR = '#2D6A6A';

function Field({
  label,
  name,
  ...rest
}: { label: string; name: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <input name={name} className={inputClass} {...rest} />
    </label>
  );
}

export function BrandForm() {
  const [state, formAction, pending] = useActionState(createBrandAction, initialState);

  return (
    <form action={formAction}>
      {/* Required by the API but not worth a field on this simplified
          onboarding form — a merchant can refine these later from Settings. */}
      <input type="hidden" name="invoicePrefix" value={DEFAULT_INVOICE_PREFIX} />
      <input type="hidden" name="currency" value={DEFAULT_CURRENCY} />
      <input type="hidden" name="timezone" value={DEFAULT_TIMEZONE} />
      <input type="hidden" name="themeColor" value={DEFAULT_THEME_COLOUR} />

      <div className="space-y-5 rounded-xl border border-border bg-surface-muted p-8">
        <Field label="Legal Name" name="legalName" placeholder="Enter your legal brand name" required />
        <Field label="Sales Person" name="salesPersonName" placeholder="Enter sales person full name" />
        <Field label="Phone Number" name="phone" type="tel" placeholder="Enter phone number" />
        <Field label="Email" name="email" type="email" placeholder="Enter email address" />

        <div className="border-t border-border pt-5">
          <span className={labelClass}>Mailing Address</span>
          <div className="space-y-3">
            <input
              name="mailingLine1"
              placeholder="Address line 1"
              className={inputClass}
            />
            <input
              name="mailingLine2"
              placeholder="Address line 2 (optional)"
              className={inputClass}
            />
            <div className="grid grid-cols-3 gap-3">
              <input name="mailingCity" placeholder="City" className={inputClass} />
              <Select name="mailingRegion" defaultValue="">
                <option value="" disabled>
                  State/Province
                </option>
                {US_STATES.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </Select>
              <input name="mailingPostalCode" placeholder="Zip/Postal code" className={inputClass} />
            </div>
            <Select name="mailingCountry" defaultValue="United States">
              {COUNTRIES.map((country) => (
                <option key={country} value={country}>
                  {country}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      {state.error && (
        <div className="mt-4 rounded-md bg-danger-surface p-3 text-sm text-danger">{state.error}</div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-6 w-full rounded-md bg-brand px-4 py-3 text-sm font-semibold text-brand-foreground disabled:opacity-60"
      >
        {pending ? 'Creating…' : 'Create Brand'}
      </button>
      <div className="mt-3 text-center">
        <a href="/" className="text-sm text-ink-muted hover:text-ink-strong">
          Cancel
        </a>
      </div>
    </form>
  );
}
