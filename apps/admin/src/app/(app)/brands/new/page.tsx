import { BrandTheme } from '@/components/brand-theme';
import { LogoMark } from '@/components/logo-mark';
import { BrandForm } from './brand-form';

export const dynamic = 'force-dynamic';

/** No brand exists to theme this page yet — near-black, same as every other
 * brand-less screen (see FALLBACK_THEME_COLOUR elsewhere in this app). */
const FALLBACK_THEME_COLOUR = '#0A0A0C';

export default function NewBrandPage() {
  return (
    <BrandTheme brandColour={FALLBACK_THEME_COLOUR}>
      <main className="mx-auto max-w-xl px-6 py-16">
        <header className="mb-8 text-center">
          <LogoMark />
          <h1 className="mt-6 text-3xl font-bold tracking-tight text-ink-strong">
            Create your first brand
          </h1>
          <p className="mt-2 text-ink-muted">
            Set up your brand profile to start creating professional invoices.
          </p>
        </header>
        <BrandForm />
      </main>
    </BrandTheme>
  );
}
