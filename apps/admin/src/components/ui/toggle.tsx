export function Toggle({
  checked,
  onChange,
  label,
  id,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: React.ReactNode;
  id?: string;
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-3">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none
                    focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-slate-900
                    ${checked ? 'bg-black' : 'bg-[#D1D5DB]'}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform
                      ${checked ? 'translate-x-[22px]' : 'translate-x-0.5'}`}
        />
      </button>
      <span className="text-base text-[#0F172A]">{label}</span>
    </label>
  );
}
