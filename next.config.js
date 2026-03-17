/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
    outputFileTracingIncludes: {
      '/api/ai/analyze': ['./src/lib/ai/prompts/**/*.txt'],
    },
  },
}

module.exports = nextConfig
