const ZEROX_API_ROOT = "https://api.0x.org";

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export const config = {
  runtime: "edge",
};

export default async function handler(request: Request) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        allow: "GET, OPTIONS",
        "cache-control": "no-store",
      },
    });
  }

  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const incomingUrl = new URL(request.url);
  const upstreamPath = incomingUrl.pathname.replace(/^\/api\/0x/, "") || "/";
  const upstreamUrl = new URL(`${ZEROX_API_ROOT}${upstreamPath}${incomingUrl.search}`);

  const upstreamHeaders = new Headers({
    accept: "application/json",
    "0x-version": "v2",
  });

  const zeroExApiKey = process.env.VITE_ZEROX_API_KEY || process.env.ZEROX_API_KEY;
  if (zeroExApiKey) {
    upstreamHeaders.set("0x-api-key", zeroExApiKey);
  }

  try {
    const upstreamResponse = await fetch(upstreamUrl.toString(), {
      method: "GET",
      headers: upstreamHeaders,
    });

    const responseHeaders = new Headers({
      "cache-control": "no-store",
    });

    const contentType = upstreamResponse.headers.get("content-type");
    if (contentType) {
      responseHeaders.set("content-type", contentType);
    }

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: responseHeaders,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to reach 0x upstream";
    return jsonResponse({ error: message }, 502);
  }
}
