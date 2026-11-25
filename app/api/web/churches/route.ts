import { evaluateChurch } from "@/lib/church-evaluation/submit";

export const maxDuration = 300;

export function POST(request: Request) {
  return evaluateChurch(request, "web");
}
