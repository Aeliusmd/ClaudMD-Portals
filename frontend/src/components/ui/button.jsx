import { cn } from "@/lib/utils";

export function Button({
  children,
  className,
  variant = "primary",
  type = "button",
  ...props
}) {
  const variants = {
    primary:
      "bg-primary text-white hover:bg-primary-dark shadow-sm",
    secondary:
      "bg-cream-deep text-ink hover:bg-border",
    outline:
      "border border-border bg-white text-ink hover:bg-cream",
    ghost: "bg-transparent text-ink hover:bg-cream-deep",
  };

  return (
    <button
      type={type}
      className={cn(
        "inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
