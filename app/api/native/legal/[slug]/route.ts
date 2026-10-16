import { readNativeLegal } from "@/features/native/server/legal"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const data = readNativeLegal((await params).slug)
  const response = Response.json(data ?? { error: "not_found" }, { status: data ? 200 : 404, headers: { "Cache-Control": "no-store" } })
  const origin = request.headers.get("origin")
  if (process.env.NODE_ENV === "development" && ["http://localhost:8081", "http://127.0.0.1:8081"].includes(origin ?? "")) {
    response.headers.set("Access-Control-Allow-Origin", origin!); response.headers.set("Vary", "Origin")
  }
  return response
}
