import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  outputFileTracingIncludes: {
    '/api/analyze': ['./prompts/common/content_analysis.txt'],
    '/api/translate': ['./prompts/**/*.txt'],
  },
};

export default nextConfig;
