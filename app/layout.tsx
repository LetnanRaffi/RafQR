import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastHost } from "../components/toast";

// No webfont: system-ui per design tokens, and it removes the next/font
// Google build-time fetch that already broke a Vercel deploy once.
export const viewport: Viewport = {
  themeColor: "#FAFAF9",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL("https://qrdata.biz.id"),
  title: {
    default: "QRData — Jembatan Transfer File & Teks Paling Kilat & Aman",
    template: "%s | QRData",
  },
  description: "Kirim file rahasia & teks antar perangkat tanpa instal apapun. QRData adalah jembatan data tercepat dengan pengaman AES-256 E2EE. Tanpa akun, tanpa jejak, otomatis hancur dalam 30 menit.",
  keywords: ["transfer file kilat", "kirim file tanpa login", "sharing file aman", "jembatan data qr", "qrdata data transfer", "e2ee file sharing", "pindah data hp ke laptop", "alat transfer file gratis", "secure tunnel data"],
  authors: [{ name: "LetnanRaffi", url: "https://raffitech.biz.id" }],
  creator: "LetnanRaffi",
  publisher: "RaffiTech Solutions",
  openGraph: {
    type: "website",
    locale: "id_ID",
    url: "https://qrdata.biz.id",
    title: "QRData — Seamless & Instant Secure Data Bridge",
    description: "Kirim file dan teks secara aman tanpa jejak. Diperkuat dengan AES-256 E2EE Encryption",
    siteName: "QRData",
    images: [
      {
        url: "/logo.svg",
        width: 800,
        height: 800,
        alt: "QRData Secure Data Bridge",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "QRData Secure Data Bridge",
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
    title: "QRData",
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
    <html lang="id">
      <body>
        {/* SVG Noise filter removed for massive performance boost */}
        <noscript>
          <div style={{ padding: "20px", textAlign: "center", color: "white", background: "#030712" }}>
            <h1>QRData — Seamless & Instant Secure Data Transfer</h1>
            <p>Kirim file dan teks secara instan antar perangkat dengan End-to-End Encryption. Tanpa login, tanpa jejak, maksimal keamanan dengan QRData buatan RaffiTech Solutions.</p>
            <p><strong>Silakan aktifkan JavaScript untuk menggunakan aplikasi ini.</strong></p>
          </div>
        </noscript>
        <ToastHost />
        {children}
      </body>
    </html>
  );
}
