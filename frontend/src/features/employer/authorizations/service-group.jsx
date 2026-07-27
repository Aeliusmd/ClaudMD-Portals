export function ServiceGroup({
  group,
  services,
  onToggleParent,
  onToggleChild,
}) {
  return (
    <div className="space-y-2">
      <label className="flex items-start gap-2.5 text-sm font-semibold text-ink">
        <input
          type="checkbox"
          checked={Boolean(services[group.id])}
          onChange={onToggleParent}
          className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary/30"
        />
        {group.label}
      </label>
      {group.children.length > 0 ? (
        <div className="space-y-2 pl-6">
          {group.children.map((child) => (
            <label
              key={child.id}
              className="flex items-center gap-2.5 text-sm text-ink"
            >
              <input
                type="checkbox"
                checked={Boolean(services[child.id])}
                onChange={() => onToggleChild(child.id)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary/30"
              />
              {child.label}
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}
