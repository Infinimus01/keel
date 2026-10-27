export const FPS = 30;

export type AssetKind = "talking" | "broll" | "screen" | "music";

export type SceneId =
  | "hook"
  | "problem"
  | "walk"
  | "screen"
  | "city"
  | "hands"
  | "customer"
  | "score";

export type Line = {
  inFrame: number;
  outFrame: number;
  text: string;
  filler: boolean;
};

export type Asset = {
  id: string;
  name: string;
  kind: AssetKind;
  duration: number;
  tags: string[];
  summary: string;
  scene: SceneId;
  lines: Line[];
};

export type TrackKind = "video" | "audio";

export type Track = {
  id: string;
  name: string;
  kind: TrackKind;
};

export type Clip = {
  id: string;
  assetId: string;
  trackId: string;
  start: number;
  srcIn: number;
  srcOut: number;
};

export type Caption = {
  id: string;
  start: number;
  end: number;
  text: string;
};

export type Sequence = {
  id: string;
  name: string;
  tracks: Track[];
  clips: Clip[];
  captions: Caption[];
};

export type Aspect = "16:9" | "9:16" | "1:1";

export type Project = {
  name: string;
  fps: number;
  aspect: Aspect;
  assets: Asset[];
  sequences: Sequence[];
};

export type IdGen = () => string;

export function clipDuration(clip: Clip): number {
  return Math.max(0, clip.srcOut - clip.srcIn);
}

export function clipEnd(clip: Clip): number {
  return clip.start + clipDuration(clip);
}

export function sequenceEnd(seq: Sequence): number {
  const fromClips = seq.clips.reduce((max, clip) => Math.max(max, clipEnd(clip)), 0);
  const fromCaps = seq.captions.reduce((max, cap) => Math.max(max, cap.end), 0);
  return Math.max(fromClips, fromCaps);
}

export function makeIdGen(prefix: string): IdGen {
  let n = 0;
  return () => {
    n += 1;
    return `${prefix}${n}`;
  };
}

export function randomId(prefix = "k"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function baseTracks(): Track[] {
  return [
    { id: "v2", name: "V2", kind: "video" },
    { id: "v1", name: "V1", kind: "video" },
    { id: "a1", name: "A1", kind: "audio" },
  ];
}
