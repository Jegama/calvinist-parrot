"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { canViewAnalytics } from "@/lib/analytics/permissions";
import { ProfileIdentityFields } from "@/components/ProfileIdentityFields";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { updateUserProfile } from "../api";
import type { ProfileIdentity } from "../types";

type ProfileCardProps = {
  profile: ProfileIdentity | null | undefined;
  name: string;
  email: string;
  labels: string[];
  onUpdate: () => Promise<unknown>;
  onLogout: () => void;
};

export function ProfileCard({ profile, name, email, labels, onUpdate, onLogout }: ProfileCardProps) {
  const [editing, setEditing] = useState<ProfileIdentity | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  function edit() {
    setEditing(profile ?? { username: null, firstName: null, lastName: null });
    setError("");
    setSaved(false);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || saving) return;

    const fields = new FormData(event.currentTarget);
    const changes: Partial<Record<keyof ProfileIdentity, string>> = {};
    for (const field of ["username", "firstName", "lastName"] as const) {
      const value = String(fields.get(field) ?? "").trim();
      if (value !== (editing[field] ?? "")) changes[field] = value;
    }

    setError("");
    setSaving(true);
    try {
      if (Object.keys(changes).length > 0) {
        await updateUserProfile(changes);
        await onUpdate();
        setSaved(true);
      }
      setEditing(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to save your profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mx-auto max-w-sm mt-10">
      <CardHeader>
        <CardTitle className="text-2xl font-serif">Profile</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p>Name: {name}</p>
          <p>Email: {email}</p>
          {profile?.username && <p>Username: {profile.username}</p>}
        </div>
        {editing ? (
          <form onSubmit={save}>
            <fieldset disabled={saving} className="grid gap-4">
              <ProfileIdentityFields profile={editing} />
              {error && <p role="alert" className="text-destructive">{error}</p>}
              <div className="flex flex-wrap gap-2">
                <Button type="submit">{saving ? "Saving…" : "Save profile"}</Button>
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
              </div>
            </fieldset>
          </form>
        ) : (
          profile !== undefined && <Button variant="outline" onClick={edit}>Edit profile</Button>
        )}
        {saved && <p role="status">Profile saved.</p>}
        <div className="flex flex-wrap gap-2">
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
