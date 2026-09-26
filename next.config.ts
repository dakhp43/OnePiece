import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: { authInterrupts: true },
  serverExternalPackages: ["@react-pdf/renderer", "@electric-sql/pglite", "pg", "nodemailer"],
};

export default nextConfig;
