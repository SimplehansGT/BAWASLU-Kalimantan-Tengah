import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // The public form accepts up to 3 photos of 5 MB each. Next's default
      // server action body limit is 1 MB, which would reject those uploads
      // with an opaque error.
      bodySizeLimit: "18mb",
    },
  },
};

export default nextConfig;
