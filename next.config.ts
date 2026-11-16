import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client"],
  // the old «Клієнти» page was replaced by «Проєкти»
  async redirects() {
    return [{ source: "/clients", destination: "/projects", permanent: false }];
  },
};

export default nextConfig;
