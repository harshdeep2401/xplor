import { Undo, Redo, Save, Eye, Box, ArrowLeft } from "lucide-react"; // icons

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
    <nav className="flex items-center justify-between px-4 py-2 bg-gray-900 text-white shadow-md">
      {/* Left: Back + Logo + Project Name */}
      <div className="flex items-center gap-2">
        {onBack && (
          <button
            onClick={onBack}
            className="p-2 rounded-lg hover:bg-gray-800 transition"
            title="Back to dashboard"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <Box className="w-6 h-6 text-blue-400" />
        <span className="font-semibold text-lg">{projectName}</span>
        {subtitle && (
          <span className="ml-2 text-xs text-gray-400" title="Room size (metres)">
            {subtitle}
          </span>
        )}
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-4">

        {saveStatus !== "idle" && (
          <span
            className={`text-sm ${
              saveStatus === "error" ? "text-red-400" : "text-gray-400"
            }`}
          >
            {SAVE_STATUS_LABEL[saveStatus]}
          </span>
        )}

        <button
          onClick={onUndo}
          className="p-2 rounded-lg hover:bg-gray-800 transition"
          title="Undo"
        >
          <Undo className="w-5 h-5" />
        </button>

        <button
          onClick={onRedo}
          className="p-2 rounded-lg hover:bg-gray-800 transition"
          title="Redo"
        >
          <Redo className="w-5 h-5" />
        </button>

        <button
          onClick={onSave}
          className="flex items-center gap-1 px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 transition"
        >
          <Save className="w-4 h-4" />
          <span>Save</span>
        </button>

        <button
          onClick={onVrPreview}
          className="flex items-center gap-1 px-3 py-1 rounded-lg bg-green-600 hover:bg-green-700 transition"
        >
          <Eye className="w-4 h-4" />
          <span>VR Preview</span>
        </button>
      </div>
    </nav>
  );
}
