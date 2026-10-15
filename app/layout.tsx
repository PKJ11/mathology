import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

const zalando = localFont({
  src: "./fonts/ZalandoSansSemiExpanded-VariableFont_wght.ttf",
  weight: "200 900",
  display: "swap",
  variable: "--font-zalando",
});

export const metadata: Metadata = {
  title: "Mathology",
  description: "Mathology by Logicology. Interactive chapters for learning maths.",
  icons: { icon: "/logo-color.svg" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f8fb" },
    { media: "(prefers-color-scheme: dark)", color: "#121317" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={zalando.variable}>
      <body>{children}</body>
    </html>
  );
}
