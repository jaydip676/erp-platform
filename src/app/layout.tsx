import type { Metadata, Viewport } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";
import { RegisterSW } from "@/components/register-sw";
import { Toaster } from "@/components/toast";
import { TopProgress } from "@/components/top-progress";

const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans", display: "swap" });

export const metadata: Metadata = {
  title: "Niva ERP",
  description: "Production & Inventory Management",
  applicationName: "Niva ERP",
  icons: { icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }], apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Niva ERP", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="gu">
      <body className={dmSans.variable}>
        <TopProgress />
        {children}
        <Toaster />
        <RegisterSW />
      </body>
    </html>
  );
}