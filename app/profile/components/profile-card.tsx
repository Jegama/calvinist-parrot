// app/profile/components/profile-card.tsx

"use client";

import Link from "next/link";
import { canViewAnalytics } from "@/lib/analytics/permissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ProfileCardProps = {
  name: string;
  email: string;
  labels: string[];
  onLogout: () => void;
};

export function ProfileCard({ name, email, labels, onLogout }: ProfileCardProps) {
  return (
    <Card className="mx-auto max-w-sm mt-10">
      <CardHeader>
        <CardTitle className="text-2xl font-serif">Profile</CardTitle>
      </CardHeader>
      <CardContent>
        <p>Name: {name}</p>
        <p>Email: {email}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {canViewAnalytics(labels) && (
            <Button asChild>
              <Link href="/admin/analytics" prefetch={false}>Analytics dashboard</Link>
            </Button>
          )}
          <Button onClick={onLogout} variant="outline">Logout</Button>
        </div>
      </CardContent>
    </Card>
  );
}
