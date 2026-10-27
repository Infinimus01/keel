import { useEffect, useRef, useState } from "react";
import { Minus, Plus, Scissors } from "lucide-react";
import { assetById } from "./project";
import { proposeMove, proposeTrim, snapStart } from "./ops";
import { framesToShort, framesToTc } from "./time";
import { clipDuration, clipEnd, type Clip } from "./types";
import { useActiveSequence, useEditor } from "./store";

export function Timeline() {
  const seq = useActiveSequence();
  const project = useEditor((state) => state.project);
  const playhead = useEditor((state) => state.playhead);
  const px = useEditor((state) => state.pxPerFrame);
  const selectedId = useEditor((state) => state.selectedClipId);
  const seek = useEditor((state) => state.seek);
  const selectClip = useEditor((state) => state.selectClip);
  const updateClip = useEditor((state) => state.updateClip);
  const setZoom = useEditor((state) => state.setZoom);
  const splitAtPlayhead = useEditor((state) => state.splitAtPlayhead);
  const dropAsset = useEditor((state) => state.dropAsset);
  const hint = useEditor((state) => state.hint);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<Clip | null>(null);
  const draftRef = useRef<Clip | null>(null);

  const end = Math.max(
    seq.clips.reduce((max, clip) => Math.max(max, clipEnd(clip)), 0),
    Math.floor(playhead) + project.fps * 4,
    project.fps * 12,
  );
  const width = end * px + 48;

  function show(clip: Clip) {
    return draft && draft.id === clip.id ? draft : clip;
  }

  function pointsFor(clipId: string): number[] {
    const points = [0, Math.floor(playhead)];
    for (const clip of seq.clips) {
      if (clip.id === clipId) continue;
      points.push(clip.start, clipEnd(clip));
    }
    return points;
  }

  function bindDrag(clip: Clip, event: React.PointerEvent, edge?: "in" | "out") {
    event.stopPropagation();
    event.preventDefault();
    selectClip(clip.id);
    const startX = event.clientX;
    const thresh = Math.max(1, Math.round(8 / px));
    let moved = false;

    const onMove = (ev: PointerEvent) => {
      const delta = Math.round((ev.clientX - startX) / px);
      if (!moved && Math.abs(ev.clientX - startX) < 4) return;
      moved = true;
      const asset = assetById(project, clip.assetId);
      if (!asset) return;
      let next: Clip | null = null;
      if (!edge) {
        const start = snapStart(clip.start + delta, clipDuration(clip), pointsFor(clip.id), thresh);
        next = proposeMove(seq, clip.id, start);
      } else {
        next = proposeTrim(seq, clip, edge, delta, asset.duration);
      }
      if (next) {
        draftRef.current = next;
        setDraft(next);
      }
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const next = draftRef.current;
      draftRef.current = null;
      setDraft(null);
      if (moved && next) updateClip(next);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function seekFrom(event: React.PointerEvent) {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const rect = scroller.getBoundingClientRect();
    const x = event.clientX - rect.left + scroller.scrollLeft;
    seek(Math.max(0, Math.round(x / px)));
  }

  const seconds = Math.ceil(end / project.fps);
  const step = px * project.fps >= 48 ? 1 : px * project.fps >= 20 ? 2 : 5;

  return (
    <section className="timeline" aria-label="Timeline">
      <div className="timeline-bar">
        <button type="button" className="icon-btn" onClick={splitAtPlayhead} aria-label="Split at playhead">
          <Scissors size={15} strokeWidth={1.75} />
          <span>Split</span>
        </button>
        <p className="hint">{hint}</p>
        <div className="zoom">
          <button type="button" className="icon-btn" aria-label="Zoom out" onClick={() => setZoom(px - 0.25)}>
            <Minus size={14} />
          </button>
          <input
            aria-label="Timeline zoom"
            type="range"
            min={0.35}
            max={6}
            step={0.05}
            value={px}
            onChange={(event) => setZoom(Number(event.target.value))}
          />
          <button type="button" className="icon-btn" aria-label="Zoom in" onClick={() => setZoom(px + 0.25)}>
            <Plus size={14} />
          </button>
        </div>
      </div>
      <div className="timeline-body">
        <div className="track-heads">
          <div className="ruler-spacer" />
          {seq.tracks.map((track) => (
            <div key={track.id} className="track-head">
              {track.name}
            </div>
          ))}
        </div>
        <div
          className="timeline-scroll"
          ref={scrollRef}
          onPointerDown={(event) => {
            if ((event.target as HTMLElement).closest(".clip")) return;
            seekFrom(event);
          }}
        >
          <div className="timeline-canvas" style={{ width }}>
            <div className="ruler" style={{ width }}>
              {Array.from({ length: Math.floor(seconds / step) + 1 }, (_, i) => {
                const sec = i * step;
                return (
                  <span key={sec} style={{ left: sec * project.fps * px }}>
                    {framesToShort(sec * project.fps)}
                  </span>
                );
              })}
            </div>
            {seq.tracks.map((track) => (
              <div
                key={track.id}
                className="lane"
                data-kind={track.kind}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "copy";
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const assetId = event.dataTransfer.getData("text/asset-id");
                  const scroller = scrollRef.current;
                  if (!assetId || !scroller) return;
                  const rect = scroller.getBoundingClientRect();
                  const x = event.clientX - rect.left + scroller.scrollLeft;
                  dropAsset(assetId, track.id, Math.max(0, Math.round(x / px)));
                }}
              >
                {seq.clips
                  .filter((clip) => clip.trackId === track.id)
                  .map((clip) => {
                    const view = show(clip);
                    const asset = assetById(project, clip.assetId);
                    const dur = clipDuration(view);
                    return (
                      <div
                        key={clip.id}
                        className={clip.id === selectedId ? "clip is-selected" : "clip"}
                        data-kind={asset?.kind ?? "talking"}
                        style={{ left: view.start * px, width: Math.max(dur * px, 4) }}
                        onPointerDown={(event) => bindDrag(clip, event)}
                      >
                        <button
                          type="button"
                          className="handle handle-in"
                          data-handle="in"
                          aria-label="Trim in"
                          onPointerDown={(event) => bindDrag(clip, event, "in")}
                        />
                        <span className="clip-name">{asset?.name ?? "Clip"}</span>
                        <span className="clip-dur">{framesToTc(view.srcIn).slice(3, 8)}</span>
                        <button
                          type="button"
                          className="handle handle-out"
                          data-handle="out"
                          aria-label="Trim out"
                          onPointerDown={(event) => bindDrag(clip, event, "out")}
                        />
                      </div>
                    );
                  })}
              </div>
            ))}
            <div className="playhead" style={{ transform: `translateX(${playhead * px}px)` }} />
          </div>
        </div>
      </div>
    </section>
  );
}

export function useEditorKeys() {
  const togglePlay = useEditor((state) => state.togglePlay);
  const shuttle = useEditor((state) => state.shuttle);
  const seek = useEditor((state) => state.seek);
  const splitAtPlayhead = useEditor((state) => state.splitAtPlayhead);
  const deleteSelected = useEditor((state) => state.deleteSelected);
  const undo = useEditor((state) => state.undo);
  const redo = useEditor((state) => state.redo);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT");
      if (typing) return;
      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && key === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && key === "y") {
        event.preventDefault();
        redo();
        return;
      }
      if (event.key === " ") {
        event.preventDefault();
        togglePlay();
        return;
      }
      if (key === "k") shuttle(0);
      if (key === "l") shuttle(1);
      if (key === "j") shuttle(-1);
      if (key === "s" && !event.metaKey && !event.ctrlKey) splitAtPlayhead();
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteSelected();
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const playhead = useEditor.getState().playhead;
        const step = event.shiftKey ? 10 : 1;
        seek(Math.floor(playhead) + (event.key === "ArrowLeft" ? -step : step));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, shuttle, seek, splitAtPlayhead, deleteSelected, undo, redo]);
}
