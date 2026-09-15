import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The app has no server-side state: everything (capture, feature extraction,
  // DTW matching, storage) runs in the browser, so a static export is enough.
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
