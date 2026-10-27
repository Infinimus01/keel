import { useEffect, useState } from "react";
import { Pause, Play, Redo2, SkipBack, Square, Undo2 } from "lucide-react";
import { Bin } from "./Bin";
import { Director } from "./Director";
import { Monitor } from "./Monitor";
import { framesToTc } from "./time";
import { sequenceEnd, type Aspect } from "./types";
import { Timeline, useEditorKeys } from "./Timeline";
import { useActiveSequence, useEditor } from "./store";

const ASPECTS: Aspect[] = ["16:9", "9:16", "1:1"];

export function Studio() {
  const project = useEditor((state) => state.project);
  const seq = useActiveSequence();
  const playhead = useEditor((state) => state.playhead);
  const playing = useEditor((state) => state.playing);
  const rate = useEditor((state) => state.rate);
  const past = useEditor((state) => state.past.length);
  const future = useEditor((state) => state.future.length);
  const undo = useEditor((state) => state.undo);
  const redo = useEditor((state) => state.redo);
  const seek = useEditor((state) => state.seek);
  const togglePlay = useEditor((state) => state.togglePlay);
  const shuttle = useEditor((state) => state.shuttle);
  const setSequence = useEditor((state) => state.setSequence);
  const exportAs = useEditor((state) => state.exportAs);
  const commit = useEditor((state) => state.commit);
  const [panel, setPanel] = useState<"bin" | "director">("director");

  useEditorKeys();

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(80, now - last);
      last = now;
      const { rate: current } = useEditor.getState();
      useEditor.getState().advance((dt / 1000) * project.fps * current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, project.fps]);

  const end = sequenceEnd(seq);

  return (
    <div className="studio" data-panel={panel}>
      <header className="topbar">
        <div className="brand">
          <strong>Keel</strong>
          <span>{project.name}</span>
        </div>
        <label className="seq">
          <span className="sr">Sequence</span>
          <select
            aria-label="Sequence"
            value={seq.id}
            onChange={(event) => setSequence(event.target.value)}
          >
            {project.sequences.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <div className="tc" aria-label="Timecode">
          {framesToTc(playhead, project.fps)}
          <small>
            {rate !== 1 && playing ? `${rate > 0 ? "+" : ""}${rate}×` : framesToTc(end, project.fps)}
          </small>
        </div>
        <div className="aspect" role="tablist" aria-label="Frame">
          {ASPECTS.map((aspect) => (
            <button
              key={aspect}
              type="button"
              role="tab"
              aria-selected={project.aspect === aspect}
              className={project.aspect === aspect ? "is-on" : ""}
              onClick={() => {
                if (project.aspect === aspect) return;
                commit({ ...project, aspect }, seq.id, false);
              }}
            >
              {aspect}
            </button>
          ))}
        </div>
        <div className="top-actions">
          <button type="button" className="icon-btn" onClick={undo} disabled={past === 0} aria-label="Undo">
            <Undo2 size={16} />
          </button>
          <button type="button" className="icon-btn" onClick={redo} disabled={future === 0} aria-label="Redo">
            <Redo2 size={16} />
          </button>
          <button type="button" className="btn-quiet" onClick={() => exportAs("edl")}>
            EDL
          </button>
          <button type="button" className="btn-quiet" onClick={() => exportAs("xml")}>
            XML
          </button>
          <button type="button" className="btn-quiet" onClick={() => exportAs("json")}>
            JSON
          </button>
        </div>
      </header>

      <div className="panel-switch">
        <button type="button" className={panel === "bin" ? "is-on" : ""} onClick={() => setPanel("bin")}>
          Footage
        </button>
        <button type="button" className={panel === "director" ? "is-on" : ""} onClick={() => setPanel("director")}>
          Director
        </button>
      </div>

      <div className="studio-main">
        <Bin />
        <section className="stage">
          <Monitor />
          <div className="transport">
            <button type="button" className="icon-btn" aria-label="Go to start" onClick={() => seek(0)}>
              <SkipBack size={16} />
            </button>
            <button type="button" className="icon-btn play" aria-label={playing ? "Pause" : "Play"} onClick={togglePlay}>
              {playing ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <button type="button" className="icon-btn" aria-label="Stop" onClick={() => shuttle(0)}>
              <Square size={14} />
            </button>
            <span className="transport-note">
              {Math.floor(playhead)} / {end} frames
            </span>
          </div>
        </section>
        <Director />
      </div>
      <Timeline />
    </div>
  );
}
