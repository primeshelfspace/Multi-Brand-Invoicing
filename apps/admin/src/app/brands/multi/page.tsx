import { listBrands } from '@/lib/api';
import { requireOnboardingStep } from '@/lib/onboarding';
import { AddBrandForm } from './add-brand-form';
import { finishMultiBrandSetupAction } from './actions';

export const dynamic = 'force-dynamic';

/**
 * No screenshot exists for this step — built as a clean, minimal, working
 * screen rather than a mockup: a running list of brands added so far, a
 * lightweight add-a-brand form, and a "Finish Setup" action gated (both
 * client-side, disabled, and server-side, in completeMultiBrandOnboarding)
 * on at least one brand actually existing.
 */
export default async function MultiBrandSetupPage() {
  await requireOnboardingStep('multi-brand-setup');
  const brands = await listBrands();

  return (
    <main className="min-h-screen bg-white px-6 py-16 sm:py-24">
      <div className="mx-auto w-full max-w-[720px]">
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-extrabold tracking-tight text-[#0F172A] sm:text-4xl">
            Add Your Brands
          </h1>
          <p className="mt-2 text-base text-[#64748B] sm:text-[17px]">
            Add each brand you operate. You can add more later from the dashboard.
          </p>
        </div>

        {brands.length > 0 && (
          <ul className="mb-8 space-y-3">
            {brands.map((brand) => (
              <li
                key={brand.id}
                className="flex items-center justify-between rounded-[10px] border border-[#D1D5DB] bg-white px-4 py-3"
              >
                <span className="font-bold text-[#0F172A]">{brand.displayName}</span>
                <span className="text-sm text-[#64748B]">{brand.legalName}</span>
              </li>
            ))}
          </ul>
        )}

        <AddBrandForm />

        <form action={finishMultiBrandSetupAction}>
          <button
            type="submit"
            disabled={brands.length === 0}
            className="w-full rounded-[10px] bg-black px-4 py-3.5 text-base font-bold text-white
                       transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-400
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black
                       focus-visible:ring-offset-2"
          >
            Finish Setup — Go to Dashboard
          </button>
        </form>
        {brands.length === 0 && (
          <p className="mt-2 text-center text-sm text-[#64748B]">Add at least one brand to finish.</p>
        )}
      </div>
    </main>
  );
}
