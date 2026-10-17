import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials } from "./format";

/** Domain composition: the shadcn avatar with the journal's name formatting. */
export function UserAvatar({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <Avatar className={className} title={name} aria-label={name}>
      <AvatarFallback>{initials(name)}</AvatarFallback>
    </Avatar>
  );
}
