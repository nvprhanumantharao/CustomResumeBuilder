import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "unpdf",
    "mammoth",
    "@react-pdf/renderer",
    "@ai-sdk/anthropic",
    "@ai-sdk/google",
  ],
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
