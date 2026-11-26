"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { rememberConsentRequest } from "@/lib/mcp/auth-return";

export function ConsentSignInLink() {
  return <Button asChild><Link href="/login" onClick={rememberConsentRequest}>Sign in to review request</Link></Button>;
}
