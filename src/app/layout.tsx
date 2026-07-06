import type { Metadata, Viewport } from "next";
import { Geist_Mono }               from "next/font/google";
import SessionProvider               from "@/components/SessionProvider";
import "./globals.css";

const mono = Geist_Mono({
  variable: "--font-mono",
  subsets:  ["latin"],
});

export const metadata: Metadata = {
  title:       "Comandas Manager",
  description: "Sistema de comandas para restaurantes",
  manifest:    "/manifest.json",
};

export const viewport: Viewport = {
  themeColor:  "#111827",
  width:       "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${mono.variable} h-full`}>
      <body className="min-h-full bg-gray-950 text-white antialiased">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
