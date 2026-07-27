export function DocumentSection({ title, children }) {
  return (
    <section className="mt-6">
      <h3 className="font-sans text-sm font-bold tracking-wide text-ink uppercase">
        {title}
      </h3>
      <div className="mt-2 space-y-1.5 text-sm leading-relaxed text-ink">
        {children}
      </div>
    </section>
  );
}

export function DocumentMetaBox({ fields }) {
  return (
    <div className="mt-4 grid gap-4 rounded-xl bg-[#f3eee4] px-4 py-4 sm:grid-cols-2">
      {fields.map((field) => (
        <div key={field.label}>
          <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
            {field.label}
          </p>
          <p className="mt-1 text-sm font-medium text-ink">{field.value}</p>
        </div>
      ))}
    </div>
  );
}

export function DocumentFooter({ signedBy, signedDate, confidentiality }) {
  return (
    <footer className="mt-8 border-t border-border/70 pt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-sm text-ink">Electronically signed by {signedBy}</p>
        <p className="text-sm text-muted">{signedDate}</p>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted">{confidentiality}</p>
    </footer>
  );
}
