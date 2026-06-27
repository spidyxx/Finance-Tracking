/**
 * A business-rule error with an associated HTTP status. Thrown by the service
 * layer; mapped to responses by lib/api-errors (web) or the MCP server.
 * Kept free of next/server imports so services stay importable outside Next.
 */
export class ServiceError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "ServiceError";
    this.status = status;
  }
}
