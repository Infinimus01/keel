import { create } from "zustand";
import { applyCommand, parseCommand, type Parsed } from "./agent";
import { downloadText, exportFileName, toEdl, toFcpXml, toProjectJson } from "./export";
import { addClip, deleteClip, hasOverlap, splitClip } from "./ops";
import { assetById, createProject } from "./project";
import { clipEnd, randomId, sequenceEnd, type AssetKind, type Clip, type Project, type Sequence } from "./types";

export type LogLine = { id: string; role: "you" | "keel"; text: string };

type KindFilter = "all" | AssetKind;

type EditorState = {
  project: Project;
  activeSequenceId: string;
  playhead: number;
  playing: boolean;
  rate: number;
  selectedClipId: string | null;
  pxPerFrame: number;
  binQuery: string;
  kindFilter: KindFilter;
  log: LogLine[];
  plan: (Parsed & { prompt: string }) | null;
  past: Project[];
  future: Project[];
  hint: string;
  commit: (project: Project, activeSequenceId?: string, rewind?: boolean) => void;
  undo: () => void;
  redo: () => void;
  seek: (frame: number) => void;
  advance: (delta: number) => void;
  togglePlay: () => void;
  shuttle: (dir: -1 | 0 | 1) => void;
  selectClip: (id: string | null) => void;
  setZoom: (px: number) => void;
  setQuery: (query: string) => void;
  setKind: (kind: KindFilter) => void;
  setSequence: (id: string) => void;
  brief: (prompt: string) => void;
  applyPlan: () => void;
  dismissPlan: () => void;
  updateClip: (clip: Clip) => void;
  dropAsset: (assetId: string, trackId: string, frame: number) => void;
  splitAtPlayhead: () => void;
  deleteSelected: () => void;
  exportAs: (kind: "edl" | "xml" | "json") => void;
};

function activeSeq(project: Project, id: string): Sequence {
  return project.sequences.find((seq) => seq.id === id) ?? project.sequences[0];
}

const initial = createProject();

export const useEditor = create<EditorState>((set, get) => ({
  project: initial,
  activeSequenceId: initial.sequences[0].id,
  playhead: 0,
  playing: false,
  rate: 1,
  selectedClipId: null,
  pxPerFrame: 1.6,
  binQuery: "",
  kindFilter: "all",
  log: [
    {
      id: "hello",
      role: "keel",
      text: "Rough assembly is on the timeline — five takes, fillers left in. Brief a cut, or trim it yourself.",
    },
  ],
  plan: null,
  past: [],
  future: [],
  hint: "Space plays. J K L shuttles. S splits. Delete lifts.",
  commit(project, activeSequenceId, rewind) {
    const cur = get();
    const seq = activeSeq(project, activeSequenceId ?? cur.activeSequenceId);
    const changed = seq.id !== cur.activeSequenceId;
    set({
      past: [...cur.past, structuredClone(cur.project)].slice(-40),
      future: [],
      project,
      activeSequenceId: seq.id,
      playhead: rewind || changed ? 0 : Math.min(cur.playhead, Math.max(0, sequenceEnd(seq))),
      selectedClipId: seq.clips.some((clip) => clip.id === cur.selectedClipId) ? cur.selectedClipId : null,
      playing: false,
      rate: 1,
    });
  },
  undo() {
    const cur = get();
    const prev = cur.past[cur.past.length - 1];
    if (!prev) return;
    const seq = prev.sequences.find((item) => item.id === cur.activeSequenceId) ?? prev.sequences[0];
    set({
      past: cur.past.slice(0, -1),
      future: [...cur.future, structuredClone(cur.project)].slice(-40),
      project: prev,
      activeSequenceId: seq.id,
      playhead: Math.min(cur.playhead, sequenceEnd(seq)),
      selectedClipId: seq.clips.some((clip) => clip.id === cur.selectedClipId) ? cur.selectedClipId : null,
      playing: false,
      rate: 1,
    });
  },
  redo() {
    const cur = get();
    const next = cur.future[cur.future.length - 1];
    if (!next) return;
    const seq = next.sequences.find((item) => item.id === cur.activeSequenceId) ?? next.sequences[0];
    set({
      future: cur.future.slice(0, -1),
      past: [...cur.past, structuredClone(cur.project)].slice(-40),
      project: next,
      activeSequenceId: seq.id,
      playhead: Math.min(cur.playhead, sequenceEnd(seq)),
      selectedClipId: seq.clips.some((clip) => clip.id === cur.selectedClipId) ? cur.selectedClipId : null,
      playing: false,
      rate: 1,
    });
  },
  seek(frame) {
    const seq = activeSeq(get().project, get().activeSequenceId);
    set({
      playhead: Math.max(0, Math.min(frame, sequenceEnd(seq))),
      playing: false,
      rate: 1,
    });
  },
  advance(delta) {
    const cur = get();
    const end = sequenceEnd(activeSeq(cur.project, cur.activeSequenceId));
    const next = cur.playhead + delta;
    if (next >= end) set({ playhead: end, playing: false, rate: 1 });
    else if (next <= 0) set({ playhead: 0, playing: false, rate: 1 });
    else set({ playhead: next });
  },
  togglePlay() {
    const { playing } = get();
    set(playing ? { playing: false, rate: 1 } : { playing: true, rate: 1 });
  },
  shuttle(dir) {
    if (dir === 0) {
      set({ playing: false, rate: 1 });
      return;
    }
    const cur = get();
    const same = cur.playing && Math.sign(cur.rate) === dir;
    const magnitude = same ? Math.min(8, Math.abs(cur.rate) * 2) : 1;
    set({ playing: true, rate: magnitude * dir });
  },
  selectClip(id) {
    set({ selectedClipId: id });
  },
  setZoom(px) {
    set({ pxPerFrame: Math.max(0.35, Math.min(6, px)) });
  },
  setQuery(binQuery) {
    set({ binQuery });
  },
  setKind(kindFilter) {
    set({ kindFilter });
  },
  setSequence(id) {
    if (!get().project.sequences.some((seq) => seq.id === id)) return;
    set({ activeSequenceId: id, playhead: 0, playing: false, rate: 1, selectedClipId: null });
  },
  brief(prompt) {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    const parsed = parseCommand(trimmed);
    const you: LogLine = { id: randomId("log"), role: "you", text: trimmed };
    const keel: LogLine = {
      id: randomId("log"),
      role: "keel",
      text: `${parsed.title}. ${parsed.detail}`,
    };
    set({
      log: [...get().log, you, keel].slice(-40),
      plan: parsed.command.type === "unknown" ? null : { ...parsed, prompt: trimmed },
    });
  },
  applyPlan() {
    const cur = get();
    if (!cur.plan || cur.plan.command.type === "unknown") return;
    const result = applyCommand(cur.project, cur.activeSequenceId, cur.plan.command, () => randomId("k"));
    get().commit(result.project, result.activeSequenceId, result.rewind);
    const note: LogLine = { id: randomId("log"), role: "keel", text: result.note };
    set({
      log: [...get().log, note].slice(-40),
      plan: null,
      hint: result.note,
    });
  },
  dismissPlan() {
    set({ plan: null });
  },
  updateClip(clip) {
    const cur = get();
    const seq = activeSeq(cur.project, cur.activeSequenceId);
    const asset = assetById(cur.project, clip.assetId);
    if (!asset) return;
    if (clip.start < 0 || clip.srcIn < 0 || clip.srcOut > asset.duration || clip.srcOut - clip.srcIn < 8) return;
    const nextSeq: Sequence = { ...seq, clips: seq.clips.map((item) => (item.id === clip.id ? clip : item)) };
    if (hasOverlap(nextSeq.clips)) return;
    cur.commit({ ...cur.project, sequences: cur.project.sequences.map((item) => (item.id === seq.id ? nextSeq : item)) });
  },
  dropAsset(assetId, trackId, frame) {
    const cur = get();
    const asset = assetById(cur.project, assetId);
    const seq = activeSeq(cur.project, cur.activeSequenceId);
    if (!asset || !seq.tracks.some((track) => track.id === trackId)) return;
    const placed = addClip(seq, asset, trackId, frame, () => randomId("k"));
    cur.commit({
      ...cur.project,
      sequences: cur.project.sequences.map((item) => (item.id === seq.id ? placed.seq : item)),
    });
    set({
      hint: placed.placedAtEnd ? `${asset.name} went to the end of ${trackId.toUpperCase()} — the drop point was occupied.` : `${asset.name} on ${trackId.toUpperCase()}.`,
      selectedClipId: placed.seq.clips[placed.seq.clips.length - 1]?.id ?? null,
    });
  },
  splitAtPlayhead() {
    const cur = get();
    const seq = activeSeq(cur.project, cur.activeSequenceId);
    const frame = Math.floor(cur.playhead);
    const selected = seq.clips.find((clip) => clip.id === cur.selectedClipId);
    const under = seq.clips.find((clip) => frame > clip.start && frame < clipEnd(clip));
    const target = selected && frame > selected.start && frame < clipEnd(selected) ? selected : under;
    if (!target) {
      set({ hint: "Playhead is not inside a clip." });
      return;
    }
    const next = splitClip(seq, target.id, frame, () => randomId("k"));
    if (!next) {
      set({ hint: "Too close to a cut to split." });
      return;
    }
    cur.commit({ ...cur.project, sequences: cur.project.sequences.map((item) => (item.id === seq.id ? next : item)) });
    set({ hint: "Split at the playhead." });
  },
  deleteSelected() {
    const cur = get();
    if (!cur.selectedClipId) return;
    const seq = activeSeq(cur.project, cur.activeSequenceId);
    const next = deleteClip(seq, cur.selectedClipId);
    cur.commit({ ...cur.project, sequences: cur.project.sequences.map((item) => (item.id === seq.id ? next : item)) });
    set({ hint: "Lifted the clip. The gap stays.", selectedClipId: null });
  },
  exportAs(kind) {
    const cur = get();
    const seq = activeSeq(cur.project, cur.activeSequenceId);
    if (kind === "edl") downloadText(exportFileName(seq, "edl"), toEdl(cur.project, seq), "text/plain");
    else if (kind === "xml") downloadText(exportFileName(seq, "fcpxml"), toFcpXml(cur.project, seq), "application/xml");
    else downloadText(exportFileName(seq, "json"), toProjectJson(cur.project, seq), "application/json");
  },
}));

export function useActiveSequence(): Sequence {
  return useEditor((state) => activeSeq(state.project, state.activeSequenceId));
}
