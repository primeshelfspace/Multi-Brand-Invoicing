'use client';

import { useActionState } from 'react';
import { addBrandAction, type AddBrandState } from './actions';

const initialState: AddBrandState = {};

const inputClass =
  'w-full rounded-[10px] border border-[#D1D5DB] bg-white px-4 py-3 text-base text-slate-900 ' +
  'placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-slate-900 focus-visible:ring-offset-1 transition-colors';
const labelClass = 'mb-2 block text-sm font-bold text-[#0F172A]';

export function AddBrandForm() {
  const [state, formAction, pending] = useActionState(addBrandAction, initialState);

  return (
    <form
      action={formAction}
      className="mb-8 space-y-4 rounded-[14px] border border-[#D1D5DB] p-6"
      // Fresh fields after each successful add — the server redirect back to
      // this same route already remounts the page, but this also covers the
      // (rare) case of a validation error followed by a second correct try.
      key={state.error ?? 'idle'}
    >
      <h2 className="text-base font-bold text-[#0F172A]">Add a brand</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={labelClass}>Brand Name</span>
          <input name="legalName" required placeholder="Enter brand name" className={inputClass} />
        </label>
        <label className="block">
          <span className={labelClass}>Brand Email</span>
          <input name="email" type="email" placeholder="Enter brand email" className={inputClass} />
        </label>
      </div>

      <label className="block">
        <span className={labelClass}>Brand Phone</span>
        <input name="phone" type="tel" placeholder="Enter phone number" className={inputClass} />
      </label>

      {state.error && (
        <p role="alert" className="rounded-[10px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-[10px] border border-[#D1D5DB] bg-white px-5 py-2.5 text-sm font-bold text-[#0F172A]
                   transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60
                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-1"
      >
        {pending ? 'Adding…' : 'Add Brand'}
      </button>
    </form>
  );
}
