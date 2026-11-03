/** The element id of a spending request's card on its vault page, so a link can point at one request. */
export function requestAnchor(requestId: string): string {
  return `request-${requestId}`;
}

export function requestPath(vaultId: string, requestId: string): string {
  return `/vaults/${vaultId}#${requestAnchor(requestId)}`;
}
