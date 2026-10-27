import { assetById } from "./project.ts";
import { framesToRate, framesToTc } from "./time.ts";
import { clipDuration, clipEnd, type Aspect, type Clip, type Project, type Sequence } from "./types.ts";

const SIZE: Record<Aspect, { w: number; h: number; name: string }> = {
  "16:9": { w: 1920, h: 1080, name: "FFVideoFormat1080p30" },
  "9:16": { w: 1080, h: 1920, name: "FFVideoFormat1080x1920p30" },
  "1:1": { w: 1080, h: 1080, name: "FFVideoFormat1080x1080p30" },
};

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function exportFileName(seq: Sequence, ext: string): string {
  return `keel-${slug(seq.name) || "sequence"}.${ext}`;
}

export function toEdl(project: Project, seq: Sequence): string {
  const lines = [
    `TITLE: ${project.name} — ${seq.name}`,
    "FCM: NON-DROP FRAME",
    "",
  ];
  const clips = [...seq.clips].sort((a, b) => a.trackId.localeCompare(b.trackId) || a.start - b.start);
  clips.forEach((clip, index) => {
    const asset = assetById(project, clip.assetId);
    const track = seq.tracks.find((item) => item.id === clip.trackId);
    const kind = track?.kind === "audio" ? "A" : "V";
    const n = String(index + 1).padStart(3, "0");
    lines.push(
      `${n}  AX       ${kind}     C        ${framesToTc(clip.srcIn)} ${framesToTc(clip.srcOut)} ${framesToTc(clip.start)} ${framesToTc(clipEnd(clip))}`,
    );
    lines.push(`* FROM CLIP NAME: ${asset?.name ?? clip.assetId}`);
    lines.push(`* TRACK: ${track?.name ?? clip.trackId}`);
    lines.push("");
  });
  if (seq.captions.length) {
    lines.push("* CAPTIONS");
    for (const cap of seq.captions) {
      lines.push(`* ${framesToTc(cap.start)} ${framesToTc(cap.end)} ${cap.text}`);
    }
    lines.push("");
  }
  lines.push(`* FRAME SIZE: ${SIZE[project.aspect].w}x${SIZE[project.aspect].h}`);
  return `${lines.join("\n")}\n`;
}

function spineXml(seq: Sequence, project: Project): string {
  const v1 = seq.clips.filter((clip) => clip.trackId === "v1").sort((a, b) => a.start - b.start);
  const parts: string[] = [];
  let cursor = 0;
  const pushGap = (duration: number) => {
    if (duration <= 0) return;
    parts.push(`          <gap name="Gap" offset="${framesToRate(cursor)}" duration="${framesToRate(duration)}" />`);
    cursor += duration;
  };
  for (const clip of v1) {
    pushGap(clip.start - cursor);
    const asset = assetById(project, clip.assetId);
    parts.push(
      `          <asset-clip ref="r_${clip.assetId}" offset="${framesToRate(clip.start)}" name="${escapeXml(asset?.name ?? clip.assetId)}" start="${framesToRate(clip.srcIn)}" duration="${framesToRate(clipDuration(clip))}" tcFormat="NDF" />`,
    );
    cursor = clipEnd(clip);
  }
  return parts.join("\n");
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&" + "amp;")
    .replaceAll("<", "&" + "lt;")
    .replaceAll(">", "&" + "gt;")
    .replaceAll('"', "&" + "quot;");
}

/** V1 is the spine. V2 and A1 travel in the EDL — FCP would hang them as connected clips. */
export function toFcpXml(project: Project, seq: Sequence): string {
  const size = SIZE[project.aspect];
  const used = new Set(seq.clips.map((clip) => clip.assetId));
  const resources = project.assets
    .filter((asset) => used.has(asset.id))
    .map((asset) => {
      const video = asset.kind === "music" ? "0" : "1";
      const audio = asset.kind === "broll" ? "0" : "1";
      return `    <asset id="r_${asset.id}" name="${escapeXml(asset.name)}" start="0s" duration="${framesToRate(asset.duration)}" hasVideo="${video}" hasAudio="${audio}" format="f1" />`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.9">
  <resources>
    <format id="f1" name="${size.name}" frameDuration="1/${project.fps}s" width="${size.w}" height="${size.h}" />
${resources}
  </resources>
  <library>
    <event name="Keel">
      <project name="${escapeXml(`${project.name} — ${seq.name}`)}">
        <sequence format="f1" duration="${framesToRate(Math.max(1, endOf(seq)))}" tcStart="0s" tcFormat="NDF">
          <spine>
${spineXml(seq, project)}
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>
`;
}

function endOf(seq: Sequence): number {
  return seq.clips.reduce((max, clip) => Math.max(max, clipEnd(clip)), 0);
}

export function toProjectJson(project: Project, seq: Sequence): string {
  return JSON.stringify(
    {
      editor: "keel",
      fps: project.fps,
      aspect: project.aspect,
      frame: SIZE[project.aspect],
      sequence: seq,
      assets: project.assets.filter((asset) => seq.clips.some((clip) => clip.assetId === asset.id)),
    },
    null,
    2,
  );
}

export function downloadText(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export type { Clip };
