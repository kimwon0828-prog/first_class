// Restrict the image optimizer to this project's two public media buckets.
const storageUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const publicImagePatterns = []
if (storageUrl) {
  const storage = new URL(storageUrl)
  if (storage.protocol === "https:") {
    for (const bucket of ["class-covers", "academy-profile-assets"]) {
      publicImagePatterns.push({ protocol: "https", hostname: storage.hostname, port: storage.port,
        pathname: `/storage/v1/object/public/${bucket}/**`, search: "" })
    }
  }
}

const nextConfig = {
  images: { remotePatterns: publicImagePatterns },
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
