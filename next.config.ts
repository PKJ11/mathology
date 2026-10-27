import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Chapter HTML is read from disk by app/lab/[chapter]/route.ts
  outputFileTracingIncludes: {
    "/lab/*": ["./content/Mathology Chapter *.html"],
  },
};

export default nextConfig;
