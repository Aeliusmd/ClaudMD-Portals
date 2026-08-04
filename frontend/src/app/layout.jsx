import { Outfit, Playfair_Display } from "next/font/google";
import "./globals.css";

const heading = Playfair_Display({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const body = Outfit({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata = {
  title: "ClaudMD — Unified Healthcare Portal",
  description: "ClaudMD Unified Healthcare Portal",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${heading.variable} ${body.variable}`}
      style={{
        margin: 0,
        padding: 0,
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: "#0e3a6d",
      }}
    >
      <body
        className="font-body antialiased"
        style={{
          margin: 0,
          padding: 0,
          width: "100%",
          height: "100%",
          overflow: "hidden",
          background: "#0e3a6d",
        }}
      >
        <div
          id="app-root"
          style={{
            position: "fixed",
            inset: 0,
            margin: 0,
            padding: 0,
            width: "100%",
            height: "100%",
            overflow: "hidden",
            background: "#fcf8f1",
          }}
        >
          {children}
        </div>
      </body>
    </html>
  );
}
