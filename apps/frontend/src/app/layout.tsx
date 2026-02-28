import type { Metadata } from "next";
import localFont from "next/font/local";
import { QueryProvider } from "@/app/QueryProvider";
import "./globals.css";

const geistSans = localFont({
  src: "../fonts/Geist-Variable.woff2",
  variable: "--font-geist-sans",
});

const geistMono = localFont({
  src: "../fonts/GeistMono-Variable.woff2",
  variable: "--font-geist-mono",
});

const outfit = localFont({
  src: "../fonts/Outfit-Variable.woff2",
  variable: "--font-outfit",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Compliance Shield - Pre-submit Claim Intelligence",
  description:
    "Catch denials before the claim leaves your system. Policy-cited recommendations, 0-100 denial risk score.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${outfit.variable} font-sans antialiased`}
      >
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
