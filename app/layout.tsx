import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";

const outfitFont = Outfit({ 
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  variable: "--font-outfit",
});

export const viewport: Viewport = {
  themeColor: "#030712",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL("https://qr.raffitech.biz.id"),
  title: {
    default: "RafQR — Seamless & Instant Secure Data Transfer",
    template: "%s | RafQR",
  },
  description: "Kirim file dan teks secara instan antar perangkat dengan End-to-End Encryption. Tanpa login, tanpa jejak, maksimal keamanan dengan RafQR Data Bridge buatan RaffiTech Labs.",
  keywords: ["file sharing", "kirim file", "secure file transfer", "end to end encryption", "file sharing instan", "rafqr", "qr file transfer", "raffitech", "transfer file aman"],
  authors: [{ name: "LetnanRaffi", url: "https://raffitech.biz.id" }],
  creator: "LetnanRaffi",
  publisher: "RaffiTech Labs",
  openGraph: {
    type: "website",
    locale: "id_ID",
    url: "https://qr.raffitech.biz.id",
    title: "RafQR — Seamless & Instant Secure Data Bridge",
    description: "Kirim file dan teks secara aman tanpa jejak. Diperkuat dengan AES-256 E2EE Encryption",
    siteName: "RafQR Data Bridge",
    images: [
      {
        url: "/logo.svg",
        width: 800,
        height: 800,
        alt: "RafQR Secure Data Bridge",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "RafQR Secure Data Bridge",
    description: "Kirim file dan teks antar perangkat tanpa akun, tanpa jejak.",
    images: ["/logo.svg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "RafQR",
  },
  icons: {
    icon: '/logo.svg',
    apple: '/logo.svg',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className={outfitFont.variable}>
      <body className={`${outfitFont.className} font-sans`}>
        <div className="mesh-blob" />
        <svg
          className="pointer-events-none fixed inset-0 z-[-1] h-full w-full opacity-[0.05]"
          xmlns="http://www.w3.org/2000/svg"
        >
          <filter id="noiseFilter">
            <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch" />
          </filter>
          <rect width="100%" height="100%" filter="url(#noiseFilter)" />
        </svg>
        {children}
      </body>
    </html>
  );
}
