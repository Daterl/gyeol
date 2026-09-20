import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    maximumRedirects: 0,
    remotePatterns: [
      {
        hostname: '**.cdninstagram.com',
        pathname: '/**',
        port: '',
        protocol: 'https',
      },
      {
        hostname: '**.fbcdn.net',
        pathname: '/**',
        port: '',
        protocol: 'https',
      },
    ],
  },
  outputFileTracingIncludes: {
    '/api/generate': [
      './prompts/output/*.md',
      './prompts/shared/style_guard.md',
    ],
    '/api/feed': ['./fixtures/*.sample.json', './fixtures/ig_snapshot.json'],
    '/api/analyze': ['./prompts/input/photo_analysis.md'],
  },
};

export default nextConfig;
