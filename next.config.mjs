const nextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  async redirects() {
    return [{ source: "/my/actions", destination: "/notifications", permanent: true }]
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "6mb"
    }
  }
}

export default nextConfig
