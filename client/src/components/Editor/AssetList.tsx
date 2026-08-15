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

export default function AssetList() {const [assets, setAssets] = useState<Asset[]>([]);
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
        console.log(data.assets)
        setAssets(data.assets);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAssets();
  }, []);

  if (isLoading) {
    return <div>Loading assets...</div>;
  }

  if (error) {
    return <div className="text-red-500">Error: {error}</div>;
  }

  return (
    <div className="mt-4 max-h-96 overflow-y-scroll">
      <h4 className="font-semibold mb-2">Assets</h4>
      <div className="space-y-2">
        {assets.map((asset) => (
          <div
            key={asset?.file_id}
            className="flex items-center justify-between p-2 rounded bg-gray-800"
            draggable="true"
            onDragStart={(e) => {
              console.log(asset?.model_url)
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
                <Box className="w-10 h-10 text-gray-400" />
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
