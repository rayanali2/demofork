import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["ffmpeg-static", "ffprobe-static", "sharp"],
  outputFileTracingIncludes: {
    "/api/generate": ["./node_modules/ffmpeg-static/ffmpeg", `./node_modules/ffprobe-static/bin/${process.platform}/${process.arch}/*`, "./assets/**/*"],
  },
  outputFileTracingExcludes: {
    "/api/generate": ["darwin/x64", "darwin/arm64", "linux/x64", "linux/ia32", "win32/x64", "win32/ia32"]
      .filter(platform => platform !== `${process.platform}/${process.arch}`)
      .map(platform => `./node_modules/ffprobe-static/bin/${platform}/**/*`),
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
