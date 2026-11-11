import type { SceneObject } from "../../types/scene";

type SceneListProps = {
  objects: SceneObject[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

export default function SceneList({
  objects,
  selectedId,
  onSelect,
}: SceneListProps) {
  return (
    <div>
      <h3 className="mb-2 text-lg font-semibold text-ink">Objects</h3>
      {objects.length === 0 ? (
        <p className="rounded-xl bg-surface-2 p-4 text-sm text-muted">
          Nothing in the scene yet. Add a shape or drag in furniture.
        </p>
      ) : (
        <div className="max-h-64 space-y-1.5 overflow-y-auto">
          {objects.map((o) => {
            const selected = o.id === selectedId;
            return (
              <button
                type="button"
                key={o.id}
                className={`block w-full cursor-pointer truncate rounded-lg border border-solid px-3 py-2 text-left text-sm ${
                  selected
                    ? "border-primary bg-primary/15 text-ink"
                    : "border-line bg-surface-2 text-ink-soft hover:bg-field"
                }`}
                onClick={() => onSelect(o.id)}
                aria-pressed={selected}
              >
                {o.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
