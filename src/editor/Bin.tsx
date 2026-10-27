import { Search } from "lucide-react";
import { searchAssets } from "./search";
import { framesToShort } from "./time";
import type { AssetKind } from "./types";
import { useEditor } from "./store";

const FILTERS: Array<{ id: "all" | AssetKind; label: string }> = [
  { id: "all", label: "All" },
  { id: "talking", label: "Talk" },
  { id: "broll", label: "B-roll" },
  { id: "screen", label: "Screen" },
  { id: "music", label: "Music" },
];

export function Bin() {
  const assets = useEditor((state) => state.project.assets);
  const query = useEditor((state) => state.binQuery);
  const kind = useEditor((state) => state.kindFilter);
  const setQuery = useEditor((state) => state.setQuery);
  const setKind = useEditor((state) => state.setKind);

  const found = searchAssets(assets, query).filter((item) => kind === "all" || item.asset.kind === kind);

  return (
    <aside className="bin">
      <div className="pane-head">
        <h2>Footage</h2>
        <span>{found.length}</span>
      </div>
      <label className="search">
        <Search size={15} strokeWidth={1.75} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search what was said"
          aria-label="Search footage"
        />
      </label>
      <div className="filters" role="tablist" aria-label="Footage type">
        {FILTERS.map((filter) => (
          <button
            key={filter.id}
            type="button"
            role="tab"
            aria-selected={kind === filter.id}
            className={kind === filter.id ? "is-on" : ""}
            onClick={() => setKind(filter.id)}
          >
            {filter.label}
          </button>
        ))}
      </div>
      <ul className="bin-list">
        {found.length === 0 ? <li className="empty">Nothing in the bin matches.</li> : null}
        {found.map(({ asset }) => (
          <li key={asset.id}>
            <button
              type="button"
              className="bin-card"
              draggable
              data-kind={asset.kind}
              onDragStart={(event) => {
                event.dataTransfer.setData("text/asset-id", asset.id);
                event.dataTransfer.effectAllowed = "copy";
              }}
            >
              <span className={`thumb scene-${asset.scene}`} />
              <span className="bin-copy">
                <span className="bin-name">{asset.name}</span>
                <span className="bin-meta">
                  {asset.kind} · {framesToShort(asset.duration)}
                  {asset.lines.some((line) => line.filler) ? " · fillers" : ""}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
