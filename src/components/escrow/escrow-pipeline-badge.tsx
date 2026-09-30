import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  DB_TO_MACHINE,
  type EscrowMachineState,
} from "@/lib/escrow/state-machine";
import type { EscrowStatus } from "@/types/database";

const PIPELINE: EscrowMachineState[] = [
  "FUNDED",
  "CLAIMED",
  "IN_TRANSIT",
  "COMPLETED",
];

const LABELS: Record<EscrowMachineState, string> = {
  FUNDED: "Funded",
  CLAIMED: "Claimed",
  IN_TRANSIT: "In transit",
  COMPLETED: "Completed",
};

export function EscrowPipelineBadge({
  status,
  className,
}: {
  status: EscrowStatus;
  className?: string;
}) {
  const current = DB_TO_MACHINE[status] ?? null;
  const idx = current ? PIPELINE.indexOf(current) : -1;

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-xs uppercase tracking-wide">
          Escrow
        </span>
        <Badge variant={current ? "default" : "secondary"}>
          {current ? LABELS[current] : status.replaceAll("_", " ")}
        </Badge>
      </div>
      <ol className="grid grid-cols-4 gap-1">
        {PIPELINE.map((step, i) => {
          const done = idx >= i;
          const active = idx === i;
          return (
            <li
              key={step}
              className={cn(
                "rounded-md px-1 py-2 text-center text-[10px] font-medium sm:text-xs",
                done
                  ? "bg-teal-700 text-white"
                  : "bg-muted text-muted-foreground",
                active && "ring-2 ring-teal-900/30 ring-offset-1",
              )}
            >
              {LABELS[step]}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
