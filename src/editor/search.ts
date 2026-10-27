import type { Asset } from "./types";

export type ScoredAsset = { asset: Asset; score: number };

export function searchAssets(assets: Asset[], query: string): ScoredAsset[] {
  const text = query.trim().toLowerCase();
  if (!text) return assets.map((asset) => ({ asset, score: 1 }));

  const terms = text.split(/\s+/).filter(Boolean);
  return assets
    .map((asset) => {
      const hay = [asset.name, asset.summary, asset.kind, ...asset.tags, ...asset.lines.map((line) => line.text)]
        .join(" ")
        .toLowerCase();
      let score = 0;
      for (const term of terms) {
        if (asset.tags.some((tag) => tag.includes(term))) score += 3;
        if (asset.name.toLowerCase().includes(term)) score += 2;
        if (asset.summary.toLowerCase().includes(term)) score += 2;
        if (hay.includes(term)) score += 1;
      }
      return { asset, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.asset.name.localeCompare(b.asset.name));
}
