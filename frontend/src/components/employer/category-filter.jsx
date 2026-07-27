import { cn } from "@/lib/utils";

export const employerCategoryToggleStyles = {
  Injury: {
    idle:
      "border border-[#FAD2CF] bg-[#FFF0F0] text-[#91302A] hover:bg-[#FEF0EE]",
    active: "border border-[#D9534F] bg-[#D9534F] text-white",
  },
  Physical: {
    idle:
      "border border-sky-200 bg-[#EFF6FF] text-[#0056B3] hover:bg-sky-100",
    active: "border border-[#0061C2] bg-[#0061C2] text-white",
  },
};

export function EmployerCategoryFilter({ value, onChange, className }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {["Injury", "Physical"].map((id) => {
        const active = value === id;
        const styles = employerCategoryToggleStyles[id];
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={cn(
              "cursor-pointer rounded-full px-4 py-2 text-sm font-semibold transition-colors",
              active ? styles.active : styles.idle
            )}
          >
            {id}
          </button>
        );
      })}
    </div>
  );
}
