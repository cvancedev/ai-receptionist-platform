import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { branding, getDeploymentWebsiteUrl } from "@/config/branding";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const deploymentWebsiteUrl = getDeploymentWebsiteUrl();

export const metadata: Metadata = {
  ...(deploymentWebsiteUrl ? { metadataBase: deploymentWebsiteUrl } : {}),
  title: {
    default: branding.defaultPageTitle,
    template: branding.titleTemplate,
  },
  description: branding.defaultMetaDescription,
  applicationName: branding.productName,
  publisher: branding.copyrightOwner,
  openGraph: {
    title: branding.defaultPageTitle,
    description: branding.defaultMetaDescription,
    siteName: branding.productName,
    type: "website",
  },
  twitter: {
    card: "summary",
    title: branding.defaultPageTitle,
    description: branding.defaultMetaDescription,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
