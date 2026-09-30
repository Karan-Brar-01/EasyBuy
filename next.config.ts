import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow Chrome on LAN IP / other local hosts to load /_next assets in dev.
  // Without this, maps/JS fail when opening http://192.168.x.x:3000 instead of localhost.
  allowedDevOrigins: [
    "192.168.1.12",
    "127.0.0.1",
    "localhost",
  ],
};

export default nextConfig;
