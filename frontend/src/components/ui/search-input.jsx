import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function SearchInput({
  value,
  onChange,
  onKeyDown,
  placeholder,
  ariaLabel = "Search",
  className,
  onClear,
}) {
  function handleClear() {
    onChange({ target: { value: "" } });
    onClear?.();
  }

  return (
    <label className={cn("relative block", className)}>
      <span className="sr-only">{ariaLabel}</span>
      <Search className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-muted" />
      <input
        type="search"
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="h-[3.15rem] w-full rounded-2xl border border-border bg-white py-3 pr-11 pl-11 text-sm text-ink outline-none placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={handleClear}
          className="absolute top-1/2 right-3.5 -translate-y-1/2 cursor-pointer rounded-full p-1 text-muted hover:bg-cream-deep hover:text-ink"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </label>
  );
}
