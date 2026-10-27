import { createProject } from "./project.ts";
import { framesToShort } from "./time.ts";
import {
  baseTracks,
  clipDuration,
  sequenceEnd,
  type Aspect,
  type Asset,
  type Clip,
  type IdGen,
  type Project,
  type Sequence,
} from "./types.ts";
import { hasOverlap, removeSilences, tighten } from "./ops.ts";

export type Command =
  | { type: "remove-silence" }
  | { type: "recap"; seconds: number; hookFirst: boolean }
  | { type: "ads" }
  | { type: "captions" }
  | { type: "aspect"; aspect: Aspect }
  | { type: "tighten" }
  | { type: "reset" }
  | { type: "unknown" };

export type Parsed = {
  command: Command;
  title: string;
  detail: string;
};

export function parseCommand(input: string): Parsed {
  const text = input.trim().toLowerCase();
  if (!text) {
    return {
      command: { type: "unknown" },
      title: "Empty brief",
      detail: "Name the cut. Silence, a recap length, ads, captions, or a frame size.",
    };
  }

  if (/silence|ums?\b|filler|\buh\b|dead air|remove pause|pauses/.test(text)) {
    return {
      command: { type: "remove-silence" },
      title: "Remove silences and fillers",
      detail:
        "On clips with a transcript, drop filler words and gaps longer than half a second, then ripple that track closed. B-roll and music stay as placed. Captions are cleared because their times move.",
    };
  }

  if (/variant|3 ad|three ad|into ads|ad variants|cut .*ads/.test(text)) {
    return {
      command: { type: "ads" },
      title: "Cut three ad variants",
      detail:
        "Problem, product, and proof. Each one is its own sequence — about fifteen, fifteen, and twelve seconds — so you can switch cuts without losing the assembly.",
    };
  }

  if (/caption|subtitle/.test(text)) {
    return {
      command: { type: "captions" },
      title: "Lay in captions",
      detail: "Non-filler transcript lines on V1 become captions in timeline time. Fillers stay out.",
    };
  }

  if (/9:16|vertical|portrait|reframe|tiktok|reel/.test(text) && !/16:9|landscape|square|1:1/.test(text)) {
    return {
      command: { type: "aspect", aspect: "9:16" },
      title: "Reframe to 9:16",
      detail:
        "The program monitor center-crops the same 16:9 composition. The timeline does not move. Export records 1080×1920.",
    };
  }

  if (/1:1|square/.test(text)) {
    return {
      command: { type: "aspect", aspect: "1:1" },
      title: "Reframe to 1:1",
      detail: "Center crop to a square frame. Timeline unchanged. Export records 1080×1080.",
    };
  }

  if (/16:9|landscape|widescreen/.test(text)) {
    return {
      command: { type: "aspect", aspect: "16:9" },
      title: "Back to 16:9",
      detail: "Full frame, no crop. Export records 1920×1080.",
    };
  }

  if (/tighten|pace|faster|pick up the pace/.test(text)) {
    return {
      command: { type: "tighten" },
      title: "Tighten pacing",
      detail: "Pull eight percent off both handles of each clip, never under twelve frames, then ripple. Captions clear.",
    };
  }

  if (/reset|rough cut|start over|restore the assembly|assembly/.test(text)) {
    return {
      command: { type: "reset" },
      title: "Restore the rough assembly",
      detail: "Puts the launch-film rushes back. Undo still holds the cut you had.",
    };
  }

  const secMatch = text.match(/(\d+)\s*(?:s\b|sec|second)/);
  if (/recap|first cut|hook|cutdown|trailer|launch|make a|cut this|cut it/.test(text) || secMatch) {
    const seconds = secMatch ? Math.max(8, Math.min(90, Number(secMatch[1]))) : 30;
    const hookFirst = !/chronolog|in order|shoot order/.test(text);
    return {
      command: { type: "recap", seconds, hookFirst },
      title: hookFirst ? `Hook-first recap, ${seconds}s` : `In-order recap, ${seconds}s`,
      detail: hookFirst
        ? "Opens on the hook line, then problem, product, and proof. Short b-roll breaths if the target has room. No silence padding."
        : "Same selects, shoot order instead of hook-first. No silence padding.",
    };
  }

  return {
    command: { type: "unknown" },
    title: "No matching operation",
    detail: "Try “remove silences”, “30s hook-first recap”, “cut this into 3 ads”, “add captions”, or “reframe to 9:16”.",
  };
}

type Pick = { assetId: string; srcIn: number; srcOut: number };

function bestLine(asset: Asset): { in: number; out: number } | null {
  const lines = asset.lines.filter((line) => !line.filler && line.outFrame - line.inFrame >= 12);
  if (!lines.length) return null;
  const best = [...lines].sort((a, b) => b.outFrame - b.inFrame - (a.outFrame - a.inFrame) || b.text.length - a.text.length)[0];
  return { in: best.inFrame, out: best.outFrame };
}

function linePick(asset: Asset | undefined): Pick | null {
  if (!asset) return null;
  const line = bestLine(asset);
  if (!line) return null;
  return { assetId: asset.id, srcIn: line.in, srcOut: line.out };
}

function rangePick(asset: Asset, frames: number): Pick {
  const dur = Math.min(frames, asset.duration);
  const srcIn = Math.max(0, Math.floor((asset.duration - dur) / 2));
  return { assetId: asset.id, srcIn, srcOut: srcIn + dur };
}

function durationOf(picks: Pick[]): number {
  return picks.reduce((sum, pick) => sum + (pick.srcOut - pick.srcIn), 0);
}

function fit(picks: Pick[], target: number): Pick[] {
  const next = picks.map((pick) => ({ ...pick }));
  while (next.length > 1 && durationOf(next) > target) next.pop();
  if (!next.length) return next;
  const over = durationOf(next) - target;
  if (over > 0) {
    const last = next[next.length - 1];
    const dur = last.srcOut - last.srcIn;
    last.srcOut = last.srcIn + Math.max(12, dur - over);
  }
  return next.filter((pick) => pick.srcOut - pick.srcIn >= 8);
}

function withBreaths(spine: Pick[], breaths: Asset[], target: number): Pick[] {
  if (!breaths.length) return fit(spine, target);
  const out: Pick[] = [];
  let bi = 0;
  for (let i = 0; i < spine.length; i += 1) {
    out.push(spine[i]);
    if (i < spine.length - 1 && durationOf(out) + 36 < target) {
      out.push(rangePick(breaths[bi % breaths.length], 45));
      bi += 1;
    }
  }
  return fit(out, target);
}

function lay(picks: Pick[], trackId: string, ids: IdGen, origin = 0): Clip[] {
  let cursor = origin;
  return picks.map((pick) => {
    const clip: Clip = {
      id: ids(),
      assetId: pick.assetId,
      trackId,
      start: cursor,
      srcIn: pick.srcIn,
      srcOut: pick.srcOut,
    };
    cursor += pick.srcOut - pick.srcIn;
    return clip;
  });
}

function coverage(length: number, city: Asset | undefined, hands: Asset | undefined, ids: IdGen): Clip[] {
  const clips: Clip[] = [];
  if (city && length > 120) {
    const dur = Math.min(60, city.duration, Math.max(12, length - 24));
    const srcIn = Math.floor((city.duration - dur) / 2);
    clips.push({ id: ids(), assetId: city.id, trackId: "v2", start: 24, srcIn, srcOut: srcIn + dur });
  }
  if (hands && length > 240) {
    const dur = Math.min(45, hands.duration);
    const start = Math.min(Math.floor(length * 0.55), length - dur - 8);
    if (start > 90) {
      clips.push({ id: ids(), assetId: hands.id, trackId: "v2", start, srcIn: 0, srcOut: dur });
    }
  }
  return clips;
}

function musicBed(music: Asset | undefined, length: number, ids: IdGen): Clip[] {
  if (!music || length <= 0) return [];
  const dur = Math.min(music.duration, length);
  return [{ id: ids(), assetId: music.id, trackId: "a1", start: 0, srcIn: 0, srcOut: dur }];
}

function findAsset(project: Project, pred: (asset: Asset) => boolean): Asset | undefined {
  return project.assets.find(pred);
}

function buildRecap(project: Project, seconds: number, hookFirst: boolean, ids: IdGen): Sequence {
  const target = seconds * project.fps;
  const hook = findAsset(project, (asset) => asset.tags.includes("hook"));
  const problem = findAsset(project, (asset) => asset.tags.includes("problem"));
  const walk = findAsset(project, (asset) => asset.id === "a_walk");
  const screen = findAsset(project, (asset) => asset.kind === "screen");
  const customer = findAsset(project, (asset) => asset.tags.includes("customer"));
  const city = findAsset(project, (asset) => asset.tags.includes("city"));
  const hands = findAsset(project, (asset) => asset.tags.includes("hands"));
  const music = findAsset(project, (asset) => asset.kind === "music");

  const ordered = hookFirst
    ? [hook, problem, screen, customer]
    : [hook, problem, walk, screen, customer];
  if (hookFirst && seconds >= 40) ordered.splice(3, 0, walk);

  const spine = ordered.map((asset) => linePick(asset)).filter((pick): pick is Pick => Boolean(pick));
  const fitted = withBreaths(spine, [city, hands].filter((asset): asset is Asset => Boolean(asset)), target);
  const v1 = lay(fitted, "v1", ids);
  const length = v1.reduce((max, clip) => Math.max(max, clip.start + clipDuration(clip)), 0);

  return {
    id: ids(),
    name: `${hookFirst ? "Recap" : "In order"} ${seconds}s`,
    tracks: baseTracks(),
    clips: [...coverage(length, city, hands, ids), ...v1, ...musicBed(music, length, ids)],
    captions: [],
  };
}

function spokenPicks(asset: Asset, maxFrames: number): Pick[] {
  const picks: Pick[] = [];
  let total = 0;
  for (const line of asset.lines) {
    if (line.filler) continue;
    const dur = line.outFrame - line.inFrame;
    if (total > 0 && total + dur > maxFrames) break;
    const use = Math.min(dur, maxFrames - total);
    if (use < 8) break;
    picks.push({ assetId: asset.id, srcIn: line.inFrame, srcOut: line.inFrame + use });
    total += use;
    if (total >= maxFrames) break;
  }
  return picks;
}

function buildAd(name: string, picks: Pick[], cover: Asset | undefined, music: Asset | undefined, ids: IdGen): Sequence {
  const v1 = lay(picks, "v1", ids);
  const length = v1.reduce((max, clip) => Math.max(max, clip.start + clipDuration(clip)), 0);
  const clips = [...v1, ...musicBed(music, length, ids)];
  if (cover && length > 60) {
    const dur = Math.min(50, cover.duration, length - 12);
    const srcIn = Math.floor((cover.duration - dur) / 2);
    clips.unshift({
      id: ids(),
      assetId: cover.id,
      trackId: "v2",
      start: Math.min(20, Math.max(0, length - dur)),
      srcIn,
      srcOut: srcIn + dur,
    });
  }
  return { id: ids(), name, tracks: baseTracks(), clips, captions: [] };
}

export function addCaptions(seq: Sequence, assets: Asset[], ids: IdGen): Sequence {
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const captions = seq.clips
    .filter((clip) => clip.trackId === "v1")
    .flatMap((clip) => {
      const asset = byId.get(clip.assetId);
      if (!asset) return [];
      return asset.lines
        .filter((line) => !line.filler)
        .map((line) => {
          const inFrame = Math.max(line.inFrame, clip.srcIn);
          const outFrame = Math.min(line.outFrame, clip.srcOut);
          if (outFrame - inFrame < 6) return null;
          return {
            id: ids(),
            start: clip.start + (inFrame - clip.srcIn),
            end: clip.start + (outFrame - clip.srcIn),
            text: line.text,
          };
        })
        .filter((cap): cap is NonNullable<typeof cap> => Boolean(cap));
    })
    .sort((a, b) => a.start - b.start);

  return { ...seq, captions };
}

function replaceSequence(project: Project, seq: Sequence): Project {
  const exists = project.sequences.some((item) => item.name === seq.name);
  const sequences = exists
    ? project.sequences.map((item) => (item.name === seq.name ? { ...seq, id: item.id } : item))
    : [...project.sequences, seq];
  const stored = sequences.find((item) => item.name === seq.name) ?? seq;
  return { ...project, sequences };
}

export type ApplyResult = {
  project: Project;
  activeSequenceId: string;
  note: string;
  rewind: boolean;
};

export function applyCommand(project: Project, activeSequenceId: string, command: Command, ids: IdGen): ApplyResult {
  const active = project.sequences.find((seq) => seq.id === activeSequenceId) ?? project.sequences[0];

  if (command.type === "unknown") {
    return {
      project,
      activeSequenceId: active.id,
      note: "Nothing applied.",
      rewind: false,
    };
  }

  if (command.type === "reset") {
    const fresh = createProject();
    return {
      project: fresh,
      activeSequenceId: fresh.sequences[0].id,
      note: "Rough assembly restored.",
      rewind: true,
    };
  }

  if (command.type === "aspect") {
    return {
      project: { ...project, aspect: command.aspect },
      activeSequenceId: active.id,
      note: `Program is ${command.aspect}. Center crop only — clips did not move.`,
      rewind: false,
    };
  }

  if (command.type === "remove-silence") {
    const before = sequenceEnd(active);
    const next = removeSilences(active, project.assets, { minGap: Math.round(project.fps / 2), dropFillers: true }, ids);
    const after = sequenceEnd(next);
    const removed = Math.max(0, before - after);
    const projectNext = {
      ...project,
      sequences: project.sequences.map((seq) => (seq.id === active.id ? next : seq)),
    };
    const note =
      removed < project.fps / 2
        ? "No dialogue gap longer than half a second on this sequence."
        : `Lifted ${framesToShort(removed)} of silence and fillers. Sequence is ${framesToShort(after)}. Captions cleared.`;
    return { project: projectNext, activeSequenceId: active.id, note, rewind: false };
  }

  if (command.type === "tighten") {
    const before = sequenceEnd(active);
    const next = tighten(active, 0.08);
    const after = sequenceEnd(next);
    const projectNext = {
      ...project,
      sequences: project.sequences.map((seq) => (seq.id === active.id ? next : seq)),
    };
    return {
      project: projectNext,
      activeSequenceId: active.id,
      note: `Tightened ${framesToShort(before)} to ${framesToShort(after)}. Captions cleared.`,
      rewind: false,
    };
  }

  if (command.type === "captions") {
    const next = addCaptions(active, project.assets, ids);
    const projectNext = {
      ...project,
      sequences: project.sequences.map((seq) => (seq.id === active.id ? next : seq)),
    };
    return {
      project: projectNext,
      activeSequenceId: active.id,
      note: next.captions.length
        ? `${next.captions.length} captions on V1 dialogue. Fillers left out.`
        : "No spoken lines on V1 to caption.",
      rewind: false,
    };
  }

  if (command.type === "recap") {
    const seq = buildRecap(project, command.seconds, command.hookFirst, ids);
    const next = replaceSequence(project, seq);
    const stored = next.sequences.find((item) => item.name === seq.name) ?? seq;
    const length = sequenceEnd(stored);
    if (hasOverlap(stored.clips)) {
      return { project, activeSequenceId: active.id, note: "Recap overlapped itself. Nothing applied.", rewind: false };
    }
    return {
      project: next,
      activeSequenceId: stored.id,
      note: `${stored.name} is ${framesToShort(length)}. Target was ${command.seconds}s — silence was not used to pad.`,
      rewind: true,
    };
  }

  const problem = findAsset(project, (asset) => asset.tags.includes("problem"));
  const screen = findAsset(project, (asset) => asset.kind === "screen");
  const walk = findAsset(project, (asset) => asset.id === "a_walk");
  const customer = findAsset(project, (asset) => asset.tags.includes("customer"));
  const city = findAsset(project, (asset) => asset.tags.includes("city"));
  const hands = findAsset(project, (asset) => asset.tags.includes("hands"));
  const music = findAsset(project, (asset) => asset.kind === "music");

  const ads = [
    problem ? buildAd("Ad — problem", spokenPicks(problem, 12 * project.fps), city, music, ids) : null,
    screen && walk
      ? buildAd(
          "Ad — product",
          [...spokenPicks(screen, 8 * project.fps), ...spokenPicks(walk, 6 * project.fps)],
          hands,
          music,
          ids,
        )
      : null,
    customer ? buildAd("Ad — proof", spokenPicks(customer, 12 * project.fps), hands, music, ids) : null,
  ].filter((seq): seq is Sequence => Boolean(seq));

  let sequences = project.sequences.filter((seq) => !ads.some((ad) => ad.name === seq.name));
  sequences = [...sequences, ...ads];
  return {
    project: { ...project, sequences },
    activeSequenceId: ads[0]?.id ?? active.id,
    note: `${ads.length} variants on the sequence menu: ${ads.map((ad) => `${ad.name} (${framesToShort(sequenceEnd(ad))})`).join(", ")}.`,
    rewind: true,
  };
}
