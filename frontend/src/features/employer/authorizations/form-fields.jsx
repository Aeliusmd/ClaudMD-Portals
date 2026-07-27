export function FieldLabel({ children, required }) {
  return (
    <span className="text-[11px] font-semibold tracking-[0.08em] text-[#8B6D4F] uppercase">
      {children}
      {required ? <span className="text-rose-600"> *</span> : null}
    </span>
  );
}

export function FormError({ message }) {
  if (!message) return null;
  return <p className="mt-1 text-xs font-medium text-rose-700">{message}</p>;
}

export function SectionStep({ number, title, hint }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
        {number}
      </span>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {hint ? (
        <span className="text-sm font-medium text-rose-600">{hint}</span>
      ) : null}
    </div>
  );
}
