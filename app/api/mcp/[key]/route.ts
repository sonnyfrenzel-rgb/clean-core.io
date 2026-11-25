import { handleMcpOther, handleMcpPost } from '@/lib/mcp/http';

/**
 * MCP beta, key as the last path segment — the form a Claude custom connector
 * without OAuth can carry, since it takes only a URL (docs/design/mcp-beta.md).
 * Off unless `MCP_BETA_KEY` is set and the deployment is not production; then 404.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ key: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { key } = await ctx.params;
  return handleMcpPost(req, key);
}

export async function GET(req: Request, ctx: Ctx) {
  const { key } = await ctx.params;
  return handleMcpOther(req, key);
}

export async function DELETE(req: Request, ctx: Ctx) {
  const { key } = await ctx.params;
  return handleMcpOther(req, key);
}
