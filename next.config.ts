import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@react-pdf/renderer", "@electric-sql/pglite", "pg", "nodemailer"],
};

export default nextConfig;
