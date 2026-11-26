import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PROFILE_NAME_MAX_LENGTH, USERNAME_HINT, USERNAME_PATTERN } from "@/lib/profile-identity";
import type { ProfileIdentity } from "@/app/profile/types";

// Registration requires all three fields. A legacy profile can fill them in independently.
export function ProfileIdentityFields({ profile }: { profile?: ProfileIdentity }) {
  return (
    <>
      <div className="grid gap-2">
        <Label htmlFor="username">Username</Label>
        <Input
          id="username"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          pattern={USERNAME_PATTERN}
          title={USERNAME_HINT}
          aria-describedby="username-hint"
          defaultValue={profile?.username ?? ""}
          required={!profile || Boolean(profile.username)}
        />
        <p id="username-hint" className="text-xs text-muted-foreground">{USERNAME_HINT}</p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="firstName">First name</Label>
        <Input
          id="firstName"
          name="firstName"
          autoComplete="given-name"
          maxLength={PROFILE_NAME_MAX_LENGTH}
          defaultValue={profile?.firstName ?? ""}
          required={!profile || Boolean(profile.firstName)}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="lastName">Last name</Label>
        <Input
          id="lastName"
          name="lastName"
          autoComplete="family-name"
          maxLength={PROFILE_NAME_MAX_LENGTH}
          defaultValue={profile?.lastName ?? ""}
          required={!profile || Boolean(profile.lastName)}
        />
      </div>
    </>
  );
}
