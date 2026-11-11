import { useState, useEffect } from "react";
import { Box } from "lucide-react";

interface Asset {
  file_id: string;
  file_name: string;
  s3_key: string;
  uploaded_at: string;
  tags: string[];
  uploaded_by: string;
  thumbnail_url: string;
  name: string;
  model_url: string;
  model_key: string;
  thumbnail_key: string;
}

// Does the asset match every word of the search (name, file name or tags)?
function matches(asset: Asset, words: string[]): boolean {
  const haystack = [asset.name, asset.file_name, ...(asset.tags ?? [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return words.every((w) => haystack.includes(w));
}

export default function AssetList({ query = "" }: { query?: string }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAssets = async () => {
      try {
        const response = await fetch("https://xplor-backend-production.up.railway.app/assets/");
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setAssets(data.assets);
      } catch {
        setError("Could not load the furniture library. Check your internet connection and reload the page.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchAssets();
  }, []);

  if (isLoading) {
    return <div className="text-sm text-muted">Loading furniture…</div>;
  }

  if (error) {
    return <div className="text-sm text-danger">{error}</div>;
  }

  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = words.length ? assets.filter((a) => matches(a, words)) : assets;

  if (shown.length === 0) {
    return (
      <div className="text-sm text-muted">
        {assets.length === 0 ? "The furniture library is empty." : `Nothing matches “${query.trim()}”.`}
      </div>
    );
  }

  return (
    <div className="max-h-96 overflow-y-auto">
      <div className="space-y-2">
        {shown.map((asset) => (
          <div
            key={asset?.file_id}
            className="flex cursor-grab items-center justify-between rounded-lg border border-solid border-line bg-field/50 p-2 hover:border-primary/60"
            draggable="true"
            onDragStart={(e) => {
              e.dataTransfer.setData("text/plain", asset?.model_url);
            }}
          >
            <div className="flex items-center gap-2">
              {asset?.thumbnail_url ? (
                <img
                  src={asset?.thumbnail_url}
                  alt={asset?.file_name}
                  className="w-14 h-14 object-cover rounded"
                />
              ) : (
                <Box className="w-10 h-10 text-muted" />
              )}
              <span className="text-sm">{asset?.name}</span>
            </div>
            {/* <button
              onClick={() => onImport(asset?.model_url)}
              className="px-2 py-1 text-xs rounded bg-blue-600 hover:bg-blue-700"
            >
              Import
            </button> */}
          </div>
        ))}
      </div>
    </div>
  );
}
