export const metadata = {
  title: "ClaudMD — Insurance Portal",
  description: "ClaudMD Insurance Portal",
};

export default function InsurancePortalLoginLayout({ children }) {
  return (
    <div
      className="h-full w-full overflow-hidden bg-white"
      style={{ position: "absolute", inset: 0, margin: 0, padding: 0 }}
    >
      {children}
    </div>
  );
}
