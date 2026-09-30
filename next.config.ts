import type { NextConfig } from "next";

const githubPages = process.env.GITHUB_PAGES === "1";
const githubBasePath = "/ming-image-studio";

const nextConfig: NextConfig = {
  /* GitHub Pages is a static export; normal local/worker builds stay SSR. */
  ...(githubPages
    ? {
        output: "export",
        assetPrefix: `${githubBasePath}/`,
      }
    : {}),
};

export default nextConfig;

