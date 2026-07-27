import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AuthorizationDetailGrid({ item }) {
  return (
    <div className="border-t border-border/60 bg-cream/25 px-4 py-5 sm:px-5">
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
            Reference
          </p>
          <p className="mt-1 text-sm font-semibold tabular-nums text-ink">
            {item.reference}
          </p>
          <p className="mt-4 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
            Incident
          </p>
          <p className="mt-1 text-sm font-semibold tabular-nums text-ink">
            {item.incidentNumber}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
            Auth ID
          </p>
          <p className="mt-1 text-sm font-semibold tabular-nums text-ink">
            {item.authId || "—"}
          </p>
          <p className="mt-4 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
            Authorization Type
          </p>
          <p className="mt-1 text-sm font-semibold text-ink">{item.type}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
            Employee
          </p>
          <p className="mt-1 text-sm font-semibold text-ink">{item.employee}</p>
          <p className="mt-4 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
            Notes
          </p>
          <p className="mt-1 text-sm font-semibold text-ink">
            {item.notes || "—"}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
            Submitted
          </p>
          <p className="mt-1 text-sm font-semibold text-ink">
            {item.submittedDate}
          </p>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => window.print()}>
          <Printer className="h-4 w-4" />
          Print
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            const blob = new Blob(
              [
                `Authorization: ${item.type}\nReference: ${item.reference}\nEmployee: ${item.employee}\n`,
              ],
              { type: "text/plain" }
            );
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `${item.reference.replace(/\s/g, "-")}.txt`;
            link.click();
            URL.revokeObjectURL(url);
          }}
        >
          <Download className="h-4 w-4" />
          Download
        </Button>
      </div>
    </div>
  );
}
