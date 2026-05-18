export const PRIVACY_RPC_PROXY_URLS = [
  "/api/privacy/rpc/0",
  "/api/privacy/rpc/1",
] as const;

export const PRIVACY_POI_PROXY_URLS = [
  "/api/privacy/poi/0",
  "/api/privacy/poi/1",
] as const;

export function getPrivacyRpcProxyUrls() {
  return [...PRIVACY_RPC_PROXY_URLS];
}

export function getPrivacyPoiProxyUrls() {
  return [...PRIVACY_POI_PROXY_URLS];
}
