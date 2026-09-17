import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    '/api/generate': [
      './prompts/output/*.md',
      './prompts/shared/style_guard.md',
    ],
    '/api/feed': ['./fixtures/*.sample.json'],
  },
};

export default nextConfig;
