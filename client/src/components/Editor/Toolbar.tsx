import { useState } from "react";
import type { FC, ReactNode } from "react";
import {
  Search,
  Box,
  Circle,
  Lightbulb,
  Upload,
  Trash2,
  Save,
  Download,
  Armchair,
  Pencil,
  FolderOpen,
} from "lucide-react";
import AssetList from "./AssetList";
import Button, { buttonClass } from "../ui/Button";
import { inputClass } from "../ui/Field";

type ToolbarProps = {
  addCube: () => void;
  addSphere: () => void;
  addLight: () => void;
  handleFile: (file: File | null) => Promise<void>;
  deleteSelected: () => void;
  exportGLTF: () => void;
  exportGLB: () => void;
  saveToBackend: () =>void;
  selectedId: string | null;
  onImportFromUrl: (url: string) => void;
};

function Section({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-solid border-line bg-surface-2 p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-soft">
        <span className="text-primary">{icon}</span> {title}
      </h3>
      {children}
    </section>
  );
}

const Toolbar: FC<ToolbarProps> = ({
  addCube,
  addSphere,
  addLight,
  handleFile,
  deleteSelected,
  exportGLB,
  saveToBackend,
  selectedId,
}) => {
  // Filters the furniture list below.
  const [query, setQuery] = useState("");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (file) {
      handleFile(file);
    }
    // Allow picking the same file again later.
    e.target.value = "";
  };

  const rowButton = "w-full justify-start";

  return (
    // `relative` + `z-10` keep the toolbar on top of the 3D canvas.
    <aside className="relative z-10 flex w-72 flex-col border-0 border-r border-solid border-line bg-surface text-ink">
      {/* Search */}
      <div className="border-0 border-b border-solid border-line p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            placeholder="Search furniture…"
            aria-label="Search furniture"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={`${inputClass} pl-9`}
          />
        </div>
      </div>

      {/* Scrollable section */}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <Section title="Add" icon={<Box className="h-4 w-4" />}>
          <div className="flex flex-col gap-2">
            <Button size="sm" className={rowButton} onClick={addCube} icon={<Box className="h-4 w-4" />}>
              Add Cube
            </Button>
            <Button size="sm" className={rowButton} onClick={addSphere} icon={<Circle className="h-4 w-4" />}>
              Add Sphere
            </Button>
            <Button size="sm" className={rowButton} onClick={addLight} icon={<Lightbulb className="h-4 w-4" />}>
              Add Light
            </Button>

            <label htmlFor="model-upload" className={buttonClass("secondary", "sm", rowButton)}>
              <Upload className="h-4 w-4" /> Import Model (.glb)
            </label>
            <input
              id="model-upload"
              type="file"
              accept=".glb"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>
        </Section>

        <Section title="Furniture" icon={<Armchair className="h-4 w-4" />}>
          <p className="mb-2 text-xs text-muted">Drag an item into the scene.</p>
          <AssetList query={query} />
        </Section>

        <Section title="Edit" icon={<Pencil className="h-4 w-4" />}>
          <Button
            variant="danger"
            size="sm"
            className="w-full"
            onClick={deleteSelected}
            disabled={!selectedId}
            icon={<Trash2 className="h-4 w-4" />}
          >
            Delete Selected
          </Button>
        </Section>

        <Section title="File" icon={<FolderOpen className="h-4 w-4" />}>
          <div className="flex flex-col gap-2">
            <Button size="sm" className={rowButton} onClick={exportGLB} icon={<Download className="h-4 w-4" />}>
              Export as GLB
            </Button>
            <Button size="sm" className={rowButton} onClick={saveToBackend} icon={<Save className="h-4 w-4" />}>
              Save Project
            </Button>
          </div>
        </Section>
      </div>
    </aside>
  );
};

export default Toolbar;
