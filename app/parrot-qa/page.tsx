import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function RetiredQaPage() {
  return (
    <main className="min-h-[calc(100vh-var(--app-header-height))] px-4 py-12">
      <Card className="mx-auto max-w-xl">
        <CardHeader>
          <CardTitle>
            <h1>Counsel of Three has retired</h1>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-muted-foreground">
            Continue asking your Bible and theology questions in Parrot chat.
            Your previously saved answers are preserved.
          </p>
          <Button asChild>
            <Link href="/">Open Parrot chat</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
