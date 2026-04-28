const { withSentryConfig } = require("@sentry/nextjs")

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // CI will catch type errors. Only ignore on Vercel if explicitly opted in.
    ignoreBuildErrors: process.env.SKIP_TYPE_CHECK === "true",
  },
  eslint: {
    // CI will catch lint errors. Only ignore on Vercel if explicitly opted in.
    ignoreDuringBuilds: process.env.SKIP_LINT === "true",
  },
  webpack: (config) => {
    config.externals.push({ 'bufferutil': 'bufferutil', 'utf-8-validate': 'utf-8-validate' })
    return config
  },
  experimental: {
    serverComponentsExternalPackages: ['ws'],
    serverActions: {
      bodySizeLimit: '10mb',
    },
    outputFileTracingIncludes: {
      '/api/ai/analyze': ['./src/lib/ai/prompts/**/*.txt'],
      // Form-builder bundles need every authored PDF binding and every
      // referenced form PDF. Vercel's tracer doesn't follow runtime
      // fs.readFile(path.join(process.cwd(), 'src/lib/forms/pdf-bindings/...'))
      // calls because the path is built at runtime — this list pins the
      // files into the function bundle explicitly.
      '/api/forms/[instanceId]/preview-pdf': [
        './src/lib/forms/pdf-bindings/**/*.json',
        './public/forms/*.pdf',
      ],
      '/api/forms/[instanceId]/auto-populate': [
        './src/lib/forms/pdf-bindings/**/*.json',
      ],
      '/api/forms/[instanceId]': [
        './src/lib/forms/pdf-bindings/**/*.json',
      ],
      '/api/forms': [
        './src/lib/forms/pdf-bindings/**/*.json',
      ],
      '/api/forms/auto-map': [
        './src/lib/forms/pdf-bindings/**/*.json',
        './public/forms/*.pdf',
      ],
      '/api/forms/pdf-fields': [
        './src/lib/forms/pdf-bindings/**/*.json',
        './public/forms/*.pdf',
      ],
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data:",
              "connect-src 'self' https://api.anthropic.com https://api.openai.com https://*.neon.tech",
              "frame-src 'self' https://docs.google.com",
              "object-src 'self'",
              "worker-src 'self' blob: https://cdnjs.cloudflare.com",
              "frame-ancestors 'self'",
            ].join("; "),
          },
        ],
      },
      {
        // No-cache for API routes that return PII
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, private" },
          { key: "Pragma", value: "no-cache" },
        ],
      },
    ]
  },
}

module.exports = withSentryConfig(nextConfig, {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  widenClientFileUpload: true,
  disableLogger: true,
  hideSourceMaps: true,
})
