import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // small internal service: no image optimization, no telemetry surprises
  images: { unoptimized: true },
};

export default nextConfig;
