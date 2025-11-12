// app/profile/components/profile-card.tsx

"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ProfileCardProps = {
  name: string;
  email: string;
  onLogout: () => void;
};

export function ProfileCard({ name, email, onLogout }: ProfileCardProps) {
  return (
    <Card className="mx-auto max-w-sm mt-10">
      <CardHeader>
        <CardTitle>Profile</CardTitle>
      </CardHeader>
      <CardContent>
        <p>Name: {name}</p>
        <p>Email: {email}</p>
        <Button onClick={onLogout} variant="outline" className="mt-4">
          Logout
        </Button>
      </CardContent>
    </Card>
  );
}
