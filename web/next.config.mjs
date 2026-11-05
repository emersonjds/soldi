import { createRequire } from "node:module";

const isProduction = process.env.NODE_ENV === "production";
const { version } = createRequire(import.meta.url)("./package.json");

/** @type {import('next').NextConfig} */

const nextConfig = {
  env: { NEXT_PUBLIC_APP_VERSION: version },
  output: isProduction ? "export" : undefined,
  images: { unoptimized: true },
  trailingSlash: false,
  reactCompiler: true,
  compiler: {
    removeConsole: isProduction,
  },
  // Dev only: the export has no server, and in production axum answers /api on the same origin.
  ...(isProduction
    ? {}
    : {
        rewrites: async () => [{ source: "/api/:path*", destination: "http://localhost:8080/api/:path*" }],
      }),
};

export default nextConfig;
