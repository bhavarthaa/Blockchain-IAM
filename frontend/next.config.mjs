/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  webpack: (config) => {
    // Optional Node-only dependencies pulled by wallet connector barrels are
    // not used by the injected browser connector.
    config.resolve.fallback = { ...config.resolve.fallback, encoding: false, "pino-pretty": false };
    return config;
  },
};

export default nextConfig;
