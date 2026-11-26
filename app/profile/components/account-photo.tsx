import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function AccountPhoto({ name }: { name: string }) {
  const initial = Array.from(name.trim())[0]?.toLocaleUpperCase() || "•";
  return (
    <Avatar aria-hidden="true" className="h-12 w-12">
      <AvatarImage src="/api/auth/photo" alt="" />
      <AvatarFallback className="font-semibold">{initial}</AvatarFallback>
    </Avatar>
  );
}
