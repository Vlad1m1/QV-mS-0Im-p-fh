import { UserRound, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { WorkMode } from "../../domain/models";

export function WorkModeBadge({ mode }: { mode: WorkMode }) {
  const shared = mode === "shared";
  const Icon = shared ? Users : UserRound;
  return (
    <Badge variant="secondary" className="work-mode-badge">
      <Icon aria-hidden="true" />
      {shared ? "Совместная" : "Одиночная"}
    </Badge>
  );
}
