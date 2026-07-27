import { CheckCircle2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export function AuthorizationStatusIcon({ status }) {
  const approved = status === "Approved";
  return (
    <div
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
        approved ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
      )}
    >
      {approved ? (
        <CheckCircle2 className="h-5 w-5" />
      ) : (
        <Clock className="h-5 w-5" />
      )}
    </div>
  );
}
