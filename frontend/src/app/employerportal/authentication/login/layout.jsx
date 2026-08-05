export const metadata = {
  title: "ClaudMD — Unified Healthcare Portal",
  description: "ClaudMD Unified Healthcare Portal",
};

export default function EmployerPortalLoginLayout({ children }) {
  return (
    <div
      className="h-full w-full overflow-hidden bg-white"
      style={{ position: "absolute", inset: 0, margin: 0, padding: 0 }}
    >
      {children}
    </div>
  );
}
