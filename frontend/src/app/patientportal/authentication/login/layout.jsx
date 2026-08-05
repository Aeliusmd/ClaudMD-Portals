export const metadata = {
  title: "ClaudMD — Patient Portal",
  description: "ClaudMD Patient Portal",
};

export default function PatientPortalLoginLayout({ children }) {
  return (
    <div
      className="h-full w-full overflow-hidden bg-white"
      style={{ position: "absolute", inset: 0, margin: 0, padding: 0 }}
    >
      {children}
    </div>
  );
}
