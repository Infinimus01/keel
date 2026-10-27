import {
  clipDuration,
  clipEnd,
  type Asset,
  type Clip,
  type IdGen,
  type Line,
  type Sequence,
} from "./types.ts";

export type Range = { in: number; out: number };

export function overlaps(a: Clip, b: Clip): boolean {
  if (a.id === b.id || a.trackId !== b.trackId) return false;
  return a.start < clipEnd(b) && b.start < clipEnd(a);
}

export function hasOverlap(clips: Clip[]): boolean {
  for (let i = 0; i < clips.length; i += 1) {
    for (let j = i + 1; j < clips.length; j += 1) {
      if (overlaps(clips[i], clips[j])) return true;
    }
  }
  return false;
}

/** Keep spoken ranges. Drop fillers. Merge neighbors separated by a short breath. */
export function speechRanges(
  asset: Asset,
  srcIn: number,
  srcOut: number,
  dropFillers: boolean,
  minGap: number,
): Range[] {
  const pieces = asset.lines
    .filter((line) => line.outFrame > srcIn && line.inFrame < srcOut)
    .filter((line) => !(dropFillers && line.filler))
    .map((line) => ({
      in: Math.max(srcIn, line.inFrame),
      out: Math.min(srcOut, line.outFrame),
    }))
    .filter((line) => line.out - line.in >= 2)
    .sort((a, b) => a.in - b.in);

  const merged: Range[] = [];
  for (const piece of pieces) {
    const last = merged[merged.length - 1];
    if (last && piece.in - last.out <= minGap) last.out = Math.max(last.out, piece.out);
    else merged.push({ ...piece });
  }
  return merged.filter((range) => range.out - range.in >= 8);
}

/**
 * Ripple each track independently. Spoken clips collapse to speech islands.
 * Clips with no transcript (b-roll, music) stay intact, including the gaps around them.
 */
export function removeSilences(
  seq: Sequence,
  assets: Asset[],
  opts: { minGap: number; dropFillers: boolean },
  ids: IdGen,
): Sequence {
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  let next = seq.clips.map((clip) => ({ ...clip }));

  for (const track of seq.tracks) {
    const onTrack = next.filter((clip) => clip.trackId === track.id).sort((a, b) => a.start - b.start);
    const rest = next.filter((clip) => clip.trackId !== track.id);
    const rebuilt: Clip[] = [];
    let shift = 0;

    for (const clip of onTrack) {
      const asset = byId.get(clip.assetId);
      const spoken = Boolean(asset && asset.lines.length > 0);
      const ranges = !spoken
        ? [{ in: clip.srcIn, out: clip.srcOut }]
        : speechRanges(asset!, clip.srcIn, clip.srcOut, opts.dropFillers, opts.minGap);

      if (ranges.length === 0) {
        shift += clipDuration(clip);
        continue;
      }

      let packed = 0;
      ranges.forEach((range, index) => {
        const dur = range.out - range.in;
        rebuilt.push({
          id: index === 0 ? clip.id : ids(),
          assetId: clip.assetId,
          trackId: track.id,
          start: Math.max(0, clip.start - shift + packed),
          srcIn: range.in,
          srcOut: range.out,
        });
        packed += dur;
      });
      shift += clipDuration(clip) - packed;
    }

    next = [...rest, ...rebuilt];
  }

  return { ...seq, clips: next, captions: [] };
}

export function tighten(seq: Sequence, ratio = 0.08): Sequence {
  let next = seq.clips.map((clip) => ({ ...clip }));

  for (const track of seq.tracks) {
    const onTrack = next.filter((clip) => clip.trackId === track.id).sort((a, b) => a.start - b.start);
    const rest = next.filter((clip) => clip.trackId !== track.id);
    const rebuilt: Clip[] = [];
    let shift = 0;

    for (const clip of onTrack) {
      const dur = clipDuration(clip);
      const cut = Math.floor(dur * ratio);
      let srcIn = clip.srcIn;
      let srcOut = clip.srcOut;
      if (cut >= 1 && dur - cut * 2 >= 12) {
        srcIn += cut;
        srcOut -= cut;
      }
      const packed = srcOut - srcIn;
      rebuilt.push({
        ...clip,
        start: Math.max(0, clip.start - shift),
        srcIn,
        srcOut,
      });
      shift += dur - packed;
    }

    next = [...rest, ...rebuilt];
  }

  return { ...seq, clips: next, captions: [] };
}

export function splitClip(seq: Sequence, clipId: string, frame: number, ids: IdGen): Sequence | null {
  const clip = seq.clips.find((item) => item.id === clipId);
  if (!clip) return null;
  const local = Math.floor(frame) - clip.start;
  if (local < 2 || local > clipDuration(clip) - 2) return null;
  const srcCut = clip.srcIn + local;
  const left: Clip = { ...clip, srcOut: srcCut };
  const right: Clip = { ...clip, id: ids(), start: clip.start + local, srcIn: srcCut };
  return {
    ...seq,
    clips: seq.clips.flatMap((item) => (item.id === clipId ? [left, right] : [item])),
  };
}

export function proposeMove(seq: Sequence, clipId: string, start: number): Clip | null {
  const clip = seq.clips.find((item) => item.id === clipId);
  if (!clip) return null;
  const next: Clip = { ...clip, start: Math.max(0, Math.round(start)) };
  if (seq.clips.some((item) => overlaps(next, item))) return null;
  return next;
}

export function proposeTrim(
  seq: Sequence,
  clip: Clip,
  edge: "in" | "out",
  delta: number,
  assetDuration: number,
): Clip | null {
  if (edge === "in") {
    let srcIn = clip.srcIn + delta;
    let start = clip.start + delta;
    if (srcIn < 0) {
      start -= srcIn;
      srcIn = 0;
    }
    if (start < 0) {
      srcIn += -start;
      start = 0;
    }
    const maxIn = clip.srcOut - 8;
    if (srcIn > maxIn) {
      start -= srcIn - maxIn;
      srcIn = maxIn;
    }
    if (start < 0 || srcIn < 0 || srcIn > clip.srcOut - 8) return null;
    const next: Clip = { ...clip, srcIn, start };
    if (seq.clips.some((item) => overlaps(next, item))) return null;
    return next;
  }

  let srcOut = clip.srcOut + delta;
  srcOut = Math.max(clip.srcIn + 8, Math.min(assetDuration, srcOut));
  const next: Clip = { ...clip, srcOut };
  if (seq.clips.some((item) => overlaps(next, item))) return null;
  return next;
}

export function addClip(
  seq: Sequence,
  asset: Asset,
  trackId: string,
  requestedStart: number,
  ids: IdGen,
): { seq: Sequence; placedAtEnd: boolean } {
  let start = Math.max(0, Math.round(requestedStart));
  let placedAtEnd = false;
  const draft: Clip = {
    id: ids(),
    assetId: asset.id,
    trackId,
    start,
    srcIn: 0,
    srcOut: asset.duration,
  };
  if (seq.clips.some((clip) => overlaps(draft, clip))) {
    start = seq.clips.filter((clip) => clip.trackId === trackId).reduce((max, clip) => Math.max(max, clipEnd(clip)), 0);
    placedAtEnd = true;
  }
  return {
    seq: { ...seq, clips: [...seq.clips, { ...draft, start }] },
    placedAtEnd,
  };
}

export function deleteClip(seq: Sequence, clipId: string): Sequence {
  const clip = seq.clips.find((item) => item.id === clipId);
  if (!clip) return seq;
  const captions = seq.captions.filter((cap) => {
    const mid = (cap.start + cap.end) / 2;
    return mid < clip.start || mid >= clipEnd(clip);
  });
  return { ...seq, clips: seq.clips.filter((item) => item.id !== clipId), captions };
}

export function snapFrame(frame: number, points: number[], threshold: number): number {
  let best = frame;
  let dist = threshold + 1;
  for (const point of points) {
    const d = Math.abs(point - frame);
    if (d < dist) {
      dist = d;
      best = point;
    }
  }
  return dist <= threshold ? best : frame;
}

export function snapStart(start: number, dur: number, points: number[], threshold: number): number {
  const byStart = snapFrame(start, points, threshold);
  if (byStart !== start) return Math.max(0, byStart);
  const endSnap = snapFrame(start + dur, points, threshold);
  if (endSnap !== start + dur) return Math.max(0, endSnap - dur);
  return Math.max(0, start);
}

export function lineAt(asset: Asset, srcFrame: number): Line | null {
  return asset.lines.find((line) => srcFrame >= line.inFrame && srcFrame < line.outFrame) ?? null;
}

export function videoAt(seq: Sequence, frame: number): Clip | null {
  for (const track of seq.tracks) {
    if (track.kind !== "video") continue;
    const hit = seq.clips.find(
      (clip) => clip.trackId === track.id && frame >= clip.start && frame < clipEnd(clip),
    );
    if (hit) return hit;
  }
  return null;
}

export function captionAt(seq: Sequence, frame: number) {
  return seq.captions.find((cap) => frame >= cap.start && frame < cap.end) ?? null;
}
