import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'RafQR Data Bridge',
    short_name: 'RafQR',
    description: 'Instant & Ephemeral Data Bridge for your files and notes',
    start_url: '/',
    display: 'standalone',
    background_color: '#000000',
    theme_color: '#000000',
    icons: [
      {
        src: '/logo.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
      {
        src: '/logo.svg',
        sizes: '192x192',
        type: 'image/svg+xml',
      },
      {
        src: '/logo.svg',
        sizes: '512x512',
        type: 'image/svg+xml',
      },
    ],
  };
}
