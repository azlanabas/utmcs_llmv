/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  // Served behind nginx on the same origin; API calls are relative to /api.
  async rewrites() {
    return process.env.NODE_ENV === 'development'
      ? [{ source: '/api/:path*', destination: 'http://127.0.0.1:8092/api/:path*' }]
      : []
  },
}
