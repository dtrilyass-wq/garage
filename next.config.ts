import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Builds write to their own directory (see package.json scripts), so
  // running `npm run build` / `npm run preview` can never corrupt the
  // .next directory of a dev server that is running at the same time.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
