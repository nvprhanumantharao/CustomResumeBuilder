import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["unpdf", "mammoth", "@react-pdf/renderer"],
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
