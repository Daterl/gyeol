import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    '/api/feed': ['./fixtures/*.sample.json'],
  },
};

export default nextConfig;
