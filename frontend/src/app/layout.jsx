import { Libre_Baskerville, Source_Sans_3 } from "next/font/google";
import "./globals.css";

const display = Libre_Baskerville({
  variable: "--font-libre",
  subsets: ["latin"],
  weight: ["400", "700"],
});

const body = Source_Sans_3({
  variable: "--font-source",
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
      className={`${display.variable} ${body.variable}`}
      style={{
        margin: 0,
        padding: 0,
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: "#0b2a4a",
      }}
    >
      <body
        className="font-sans antialiased"
        style={{
          margin: 0,
          padding: 0,
          width: "100%",
          height: "100%",
          overflow: "hidden",
          background: "#0b2a4a",
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
            background: "#f7f3ea",
          }}
        >
          {children}
        </div>
      </body>
    </html>
  );
}
