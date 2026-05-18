const DEFAULT_ARBITRUM_RPCS = [
  "https://arb-pokt.nodies.app",
  "https://rpc.ankr.com/arbitrum",
  "https://arbitrum.drpc.org",
  "https://arb1.arbitrum.io/rpc",
] as const;

const MAX_GET_LOGS_BLOCK_RANGE = 10n;

type JsonRpcRequest = {
  id?: string | number | null;
  jsonrpc?: string;
  method?: string;
  params?: unknown[];
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function getConfiguredRpcUrls() {
  const fromEnv = (process.env.PRIVACY_RPC_URLS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const urls = fromEnv.length > 0 ? fromEnv : [...DEFAULT_ARBITRUM_RPCS];
  return Array.from(new Set(urls));
}

function rotateUrls(urls: string[], slot: string) {
  const slotIndex = Number.parseInt(slot, 10);
  if (!Number.isFinite(slotIndex) || urls.length <= 1) return urls;
  const offset = ((slotIndex % urls.length) + urls.length) % urls.length;
  return [...urls.slice(offset), ...urls.slice(0, offset)];
}

function parseHexBlockTag(value: unknown) {
  if (typeof value !== "string") return null;
  if (value === "latest" || value === "earliest" || value === "pending") return null;
  if (!value.startsWith("0x")) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function toHexBlock(value: bigint) {
  return `0x${value.toString(16)}`;
}

async function forwardRpc(upstream: string, payload: JsonRpcRequest) {
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

function shouldChunkGetLogs(payload: JsonRpcRequest) {
  if (payload.method !== "eth_getLogs") return false;
  const filter = payload.params?.[0] as Record<string, unknown> | undefined;
  const fromBlock = parseHexBlockTag(filter?.fromBlock);
  const toBlock = parseHexBlockTag(filter?.toBlock);
  if (fromBlock === null || toBlock === null) return false;
  return toBlock >= fromBlock;
}

async function handleChunkedGetLogs(upstream: string, payload: JsonRpcRequest) {
  const filter = payload.params?.[0] as Record<string, unknown>;
  const fromBlock = parseHexBlockTag(filter.fromBlock)!;
  const toBlock = parseHexBlockTag(filter.toBlock)!;

  const results: any[] = [];
  const seen = new Set<string>();

  for (let start = fromBlock; start <= toBlock; start += MAX_GET_LOGS_BLOCK_RANGE) {
    const end =
      start + (MAX_GET_LOGS_BLOCK_RANGE - 1n) > toBlock
        ? toBlock
        : start + (MAX_GET_LOGS_BLOCK_RANGE - 1n);

    const chunkPayload: JsonRpcRequest = {
      ...payload,
      params: [
        {
          ...filter,
          fromBlock: toHexBlock(start),
          toBlock: toHexBlock(end),
        },
      ],
    };

    const chunkResponse = await forwardRpc(upstream, chunkPayload);
    if (!chunkResponse.ok || !Array.isArray(chunkResponse.parsed?.result)) {
      throw new Error(
        chunkResponse.parsed?.error?.message ||
          `RPC getLogs chunk failed with status ${chunkResponse.status}`,
      );
    }

    for (const log of chunkResponse.parsed.result) {
      const dedupeKey = [
        log?.transactionHash || "",
        log?.logIndex || "",
        log?.blockHash || "",
      ].join(":");

      if (!seen.has(dedupeKey)) {
        seen.add(dedupeKey);
        results.push(log);
      }
    }
  }

  return {
    jsonrpc: payload.jsonrpc || "2.0",
    id: payload.id ?? null,
    result: results,
  };
}

export const config = {
  runtime: "nodejs",
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

  let payload: JsonRpcRequest;
  try {
    payload = (await request.json()) as JsonRpcRequest;
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const upstreams = rotateUrls(getConfiguredRpcUrls(), slot);
  let lastError = "No upstream RPCs configured";

  for (const upstream of upstreams) {
    try {
      if (shouldChunkGetLogs(payload)) {
        return json(await handleChunkedGetLogs(upstream, payload));
      }

      const response = await forwardRpc(upstream, payload);
      if (response.ok && response.parsed) {
        return json(response.parsed);
      }

      lastError =
        response.parsed?.error?.message ||
        response.raw ||
        `RPC upstream failed with status ${response.status}`;
    } catch (error) {
      lastError =
        error instanceof Error ? error.message : "Unknown RPC proxy error";
    }
  }

  return json(
    {
      jsonrpc: payload.jsonrpc || "2.0",
      id: payload.id ?? null,
      error: {
        code: -32000,
        message: lastError,
      },
    },
    502,
  );
}
