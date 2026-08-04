import { requireOnboardingStep } from '@/lib/onboarding';
import { BrandForm } from './brand-form';

export const dynamic = 'force-dynamic';

export default async function CompanyDetailsPage() {
  await requireOnboardingStep('company-details');

  return (
    <main className="min-h-screen bg-white px-6 py-16 sm:py-24">
      <div className="mx-auto w-full max-w-[1000px]">
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-extrabold tracking-tight text-[#0F172A] sm:text-4xl">
            Create Your First Brand
          </h1>
          <p className="mt-2 text-base text-[#64748B] sm:text-[17px]">
            Set up your first brand. You can add more brands from the dashboard.
          </p>
        </div>

        <BrandForm />
      </div>
    </main>
  );
}
