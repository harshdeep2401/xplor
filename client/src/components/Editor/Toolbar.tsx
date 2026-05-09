import type { FC } from "react";
import {
  Search,
  Box,
  Circle,
  Upload,
  Trash2,
  Save,
  Download,
} from "lucide-react";
import AssetList from "./AssetList";

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
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (file) {
      handleFile(file);
    }
  };

  return (
    // ✅ FIX: Added `relative` and `z-10` to ensure the toolbar renders on top of the 3D canvas.
    <aside className="w-72 bg-gray-900 border-r border-gray-800 flex flex-col text-gray-100 relative z-10">
      {/* 🔍 Search Bar (fixed inside toolbar) */}
      <div className="p-4 border-b border-gray-800">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search..."
            className="w-full rounded-lg bg-gray-800 pl-10 pr-3 py-2 text-sm text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* 🔽 Scrollable section */}
      {/* This will now work as expected because the parent's height is correctly constrained. */}
      <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-4">

        {/* ➕ Add Section */}
        <div className="rounded-2xl bg-gray-800 p-4 shadow-md">
          <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-blue-400">
            <Box className="h-5 w-5" /> Add
          </h3>
          <div className="flex flex-col gap-2">
            <button
              onClick={addCube}
              className="flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm hover:bg-blue-700"
            >
              <Box className="h-4 w-4" /> Add Cube
            </button>
            <button
              onClick={addSphere}
              className="flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm hover:bg-blue-700"
            >
              <Circle className="h-4 w-4" /> Add Sphere
            </button>
            <button
              onClick={addLight}
              className="flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm hover:bg-blue-700"
            >
              <Circle className="h-4 w-4" /> Add Light
            </button>

            <label
              htmlFor="model-upload"
              className="flex cursor-pointer items-center gap-2 rounded-md bg-green-600 px-3 py-2 text-sm hover:bg-green-700"
            >
              <Upload className="h-4 w-4" /> Import Model
            </label>
            <input
              id="model-upload"
              type="file"
              accept=".glb"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>
        </div>

        {/* Assets Section */}
        <div className="rounded-2xl bg-gray-800 p-4 shadow-md">
          <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-teal-400">
            <Box className="h-5 w-5" /> Assets
          </h3>
          <AssetList />
        </div>

        {/* 📝 Edit Section */}
        <div className="rounded-2xl bg-gray-800 p-4 shadow-md">
          <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-red-400">
            <Trash2 className="h-5 w-5" /> Edit
          </h3>
          <button
            onClick={deleteSelected}
            disabled={!selectedId}
            className={`w-full flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm ${selectedId
                ? "bg-red-600 hover:bg-red-700"
                : "bg-gray-700 text-gray-400 cursor-not-allowed"
              }`}
          >
            <Trash2 className="h-4 w-4" /> Delete Selected
          </button>
        </div>

        {/* 📁 File Section */}
        <div className="rounded-2xl bg-gray-800 p-4 shadow-md">
          <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-purple-400">
            <Download className="h-5 w-5" /> File
          </h3>
          <div className="flex flex-col gap-2">
            {/* <button
              onClick={exportGLTF}
              className="flex items-center gap-2 rounded-md bg-purple-600 px-3 py-2 text-sm hover:bg-purple-700"
            >
              <Download className="h-4 w-4" /> Export as GLTF
            </button> */}
            <button
              onClick={exportGLB}
              className="flex items-center gap-2 rounded-md bg-purple-600 px-3 py-2 text-sm hover:bg-purple-700"
            >
              <Download className="h-4 w-4" /> Export as GLB
            </button>
            <button
              onClick={saveToBackend}
              className="flex items-center gap-2 rounded-md bg-pink-600 px-3 py-2 text-sm hover:bg-pink-700"
            >
              <Save className="h-4 w-4" /> Save to Backend
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Toolbar;
