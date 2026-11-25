import { handleMcpOther, handleMcpPost } from '@/lib/mcp/http';

/**
 * MCP beta, key in the `Authorization: Bearer` header (docs/design/mcp-beta.md).
 * Off unless `MCP_BETA_KEY` is set and the deployment is not production; then 404.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  return handleMcpPost(req, null);
}

export async function GET(req: Request) {
  return handleMcpOther(req, null);
}

export async function DELETE(req: Request) {
  return handleMcpOther(req, null);
}
