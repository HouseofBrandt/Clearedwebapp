import { NextResponse } from "next/server"

const VIDEO_URL = "https://iivubf6t07cfbvos.public.blob.vercel-storage.com/Video%20Project.mp4"

export async function GET(request: Request) {
  try {
    const range = request.headers.get("range")
    const headers: Record<string, string> = {}
    if (range) {
      headers["Range"] = range
    }

    const resp = await fetch(VIDEO_URL, { headers })

    const responseHeaders = new Headers()
    responseHeaders.set("Content-Type", resp.headers.get("content-type") || "video/mp4")
    responseHeaders.set("Cache-Control", "public, max-age=86400, immutable")
    responseHeaders.set("Accept-Ranges", "bytes")

    if (resp.headers.get("content-length")) {
      responseHeaders.set("Content-Length", resp.headers.get("content-length")!)
    }
    if (resp.headers.get("content-range")) {
      responseHeaders.set("Content-Range", resp.headers.get("content-range")!)
    }

    return new NextResponse(resp.body, {
      status: resp.status,
      headers: responseHeaders,
    })
  } catch {
    return new NextResponse(null, { status: 502 })
  }
}
