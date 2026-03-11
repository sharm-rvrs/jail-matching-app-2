import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@cedrugs/pdf-parse", "unpdf"],
};

export default nextConfig;
