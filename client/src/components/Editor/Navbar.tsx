import { Undo, Redo, Save, Eye, Box, ArrowLeft } from "lucide-react"; // icons
import Button from "../ui/Button";

type SaveStatus = "idle" | "saving" | "saved" | "error";

type NavbarProps = {
  projectName: string;
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onVrPreview: () => void;
  onBack?: () => void;
  saveStatus?: SaveStatus;
  subtitle?: string;
};

const SAVE_STATUS_LABEL: Record<SaveStatus, string> = {
  idle: "",
  saving: "Saving…",
  saved: "Saved",
  error: "Save failed",
};

export default function Navbar({
  projectName,
  onSave,
  onUndo,
  onRedo,
  onVrPreview,
  onBack,
  saveStatus = "idle",
  subtitle,
}: NavbarProps) {
  return (
    <nav className="flex items-center justify-between gap-4 border-0 border-b border-solid border-line bg-surface px-4 py-2 text-ink">
      {/* Left: Back + Logo + Project Name */}
      <div className="flex min-w-0 items-center gap-2">
        {onBack && (
          <Button variant="ghost" size="sm" onClick={onBack} title="Back to dashboard" aria-label="Back to dashboard">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}
        <Box className="h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
        <span className="truncate text-lg font-semibold">{projectName}</span>
        {subtitle && (
          <span className="ml-2 whitespace-nowrap text-xs text-muted" title="Room size (metres)">
            {subtitle}
          </span>
        )}
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        {saveStatus !== "idle" && (
          <span className={`mr-2 text-sm ${saveStatus === "error" ? "text-danger" : "text-muted"}`}>
            {SAVE_STATUS_LABEL[saveStatus]}
          </span>
        )}

        <Button variant="ghost" size="sm" onClick={onUndo} title="Undo (Ctrl+Z)" aria-label="Undo">
          <Undo className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="sm" onClick={onRedo} title="Redo (Ctrl+Y)" aria-label="Redo">
          <Redo className="h-5 w-5" />
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={onSave}
          loading={saveStatus === "saving"}
          icon={<Save className="h-4 w-4" />}
        >
          Save
        </Button>
        <Button size="sm" onClick={onVrPreview} icon={<Eye className="h-4 w-4" />}>
          VR Preview
        </Button>
      </div>
    </nav>
  );
}
