import { protectedResourceMetadata } from "@/lib/mcp/auth";

export function GET() {
  return protectedResourceMetadata();
}
