'use client';

import { useActionState } from 'react';
import { finishMultiBrandSetupAction, type FinishSetupState } from './actions';

const initialState: FinishSetupState = {};

/**
 * A client component only so this button can show the same pending/disabled
 * treatment every other submit button in onboarding has — a bare
 * `<form action={...}>` around a server action works, but gives up the
 * loading state and the guard against a double-click firing the request
 * twice while the first is still in flight.
 */
export function FinishSetupForm({ hasBrands }: { hasBrands: boolean }) {
  const [state, formAction, pending] = useActionState(finishMultiBrandSetupAction, initialState);

  return (
    <form action={formAction}>
      {state.error && (
        <p role="alert" className="mb-4 rounded-[10px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={!hasBrands || pending}
        className="w-full rounded-[10px] bg-black px-4 py-3.5 text-base font-bold text-white
                   transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-[#E5E7EB]
                   disabled:text-[#94A3B8] focus-visible:outline-none focus-visible:ring-2
                   focus-visible:ring-black focus-visible:ring-offset-2"
      >
        {pending ? 'Finishing…' : 'Finish Setup — Go to Dashboard'}
      </button>
      {!hasBrands && (
        <p className="mt-2 text-center text-sm text-[#64748B]">Add at least one brand to finish.</p>
      )}
    </form>
  );
}
