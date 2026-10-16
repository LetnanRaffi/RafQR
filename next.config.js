const signalingUrl = process.env.NEXT_PUBLIC_P2P_SIGNALING_URL ||
  (process.env.VERCEL_ENV === 'production'
    ? 'https://rafqr-signaling-production.qrdata.workers.dev'
    : '');

module.exports = {
  env: {
    NEXT_PUBLIC_P2P_SIGNALING_URL: signalingUrl,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '100mb',
    },
  },
}
