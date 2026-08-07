export function PortalAccessBlocked() {
  return (
    <div className="flex min-h-full w-full items-center justify-center bg-cream px-4 py-10">
      <div className="w-full max-w-lg rounded-2xl border border-[#ece7df] bg-white px-6 py-8 shadow-sm sm:px-8">
        <p className="font-heading text-2xl font-bold tracking-tight text-foreground-900">
          Portal login required
        </p>
        <p className="mt-3 font-body text-sm leading-relaxed text-foreground-500">
          Direct login is not available. Open the secure portal link from your
          invitation email. The URL must include your portal path and activation
          key, for example:
        </p>
        <ul className="mt-4 space-y-2 font-mono text-xs break-all text-foreground-700">
          <li>
            /employerportal/authentication/login?activationkey=…
          </li>
          <li>
            /patientportal/authentication/login?activationkey=…
          </li>
          <li>
            /insuranceportal/authentication/login?activationkey=…
          </li>
        </ul>
      </div>
    </div>
  );
}
