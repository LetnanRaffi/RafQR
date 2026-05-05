import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";

const outfitFont = Outfit({ 
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  variable: "--font-outfit",
});

export const viewport: Viewport = {
  themeColor: "#ffffff",
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
        {/* SVG Noise filter removed for massive performance boost */}
        <noscript>
          <div style={{ padding: "20px", textAlign: "center", color: "white", background: "#030712" }}>
            <h1>RafQR — Seamless & Instant Secure Data Transfer</h1>
            <p>Kirim file dan teks secara instan antar perangkat dengan End-to-End Encryption. Tanpa login, tanpa jejak, maksimal keamanan dengan RafQR Data Bridge buatan RaffiTech Labs.</p>
            <p><strong>Silakan aktifkan JavaScript untuk menggunakan aplikasi ini.</strong></p>
          </div>
        </noscript>
        {children}
      </body>
    </html>
  );
}
