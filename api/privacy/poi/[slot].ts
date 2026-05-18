const DEFAULT_POI_NODES = [
  "https://ppoi-agg.horsewithsixlegs.xyz",
  "https://poi.railgun.org",
] as const;

type JsonRpcPayload = Record<string, unknown>;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function getConfiguredPoiNodes() {
  const fromEnv = (process.env.RAILGUN_POI_NODE_URLS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const urls = fromEnv.length > 0 ? fromEnv : [...DEFAULT_POI_NODES];
  return Array.from(new Set(urls));
}

function rotateUrls(urls: string[], slot: string) {
  const slotIndex = Number.parseInt(slot, 10);
  if (!Number.isFinite(slotIndex) || urls.length <= 1) return urls;
  const offset = ((slotIndex % urls.length) + urls.length) % urls.length;
  return [...urls.slice(offset), ...urls.slice(0, offset)];
}

async function forwardPoi(upstream: string, payload: JsonRpcPayload) {
  const response = await fetch(upstream, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  const raw = await response.text();
  let parsed: any = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }

  return {
    ok: response.ok && parsed && !parsed.error,
    status: response.status,
    raw,
    parsed,
  };
}

export const config = {
  runtime: "edge",
};

export default async function handler(request: Request) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        allow: "POST, OPTIONS",
        "cache-control": "no-store",
      },
    });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const url = new URL(request.url);
  const slot = url.pathname.split("/").pop() || "0";

  let payload: JsonRpcPayload;
  try {
    payload = (await request.json()) as JsonRpcPayload;
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const upstreams = rotateUrls(getConfiguredPoiNodes(), slot);
  let lastError = "No upstream POI nodes configured";

  for (const upstream of upstreams) {
    try {
      const response = await forwardPoi(upstream, payload);
      if (response.ok && response.parsed) {
        return json(response.parsed);
      }

      lastError =
        response.parsed?.error?.message ||
        response.raw ||
        `POI upstream failed with status ${response.status}`;
    } catch (error) {
      lastError =
        error instanceof Error ? error.message : "Unknown POI proxy error";
    }
  }

  return json(
    {
      error: {
        code: -32000,
        message: lastError,
      },
    },
    502,
  );
}
