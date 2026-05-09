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
    <div className="mt-2 space-y-2 overflow-y-auto max-h-64">
      {objects.map((o) => (
        <div
          key={o.id}
          className={`p-2 rounded border cursor-pointer ${
            o.id === selectedId
              ? "bg-gray-900 border-blue-400"
              : "bg-gray-800 border-gray-200"
          }`}
          onClick={() => onSelect(o.id)}
        >
          <div className="font-medium">{o.name}</div>
        </div>
      ))}
    </div>
  );
}
