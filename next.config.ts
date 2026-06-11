import type { NextConfig } from "next";

const securityHeaders = [
  {
    key: "X-DNS-Prefetch-Control",
    value: "on",
  },
  {
    key: "X-Frame-Options",
    value: "SAMEORIGIN",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    // Allow Monaco Editor CDN workers + Google Fonts + same-origin everything else.
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Scripts: same-origin + Monaco CDN (loaded via @monaco-editor/react)
      "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com blob:",
      // Styles: same-origin + inline (Monaco injects style tags) + Google Fonts
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      // Fonts: same-origin + Google Fonts CDN
      "font-src 'self' https://fonts.gstatic.com data:",
      // Images: same-origin + data URIs (base64 previews)
      "img-src 'self' data: blob:",
      // Workers: blob: (Monaco spawns web workers via blob URLs)
      "worker-src blob:",
      // Connect: same-origin API calls + Google AI API
      "connect-src 'self' https://generativelanguage.googleapis.com",
      // Media (video previews)
      "media-src 'self' blob:",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
