import {
  baseTracks,
  FPS,
  type Asset,
  type Line,
  type Project,
  type Sequence,
} from "./types.ts";

function at(seconds: number): number {
  return Math.round(seconds * FPS);
}

function line(inSec: number, outSec: number, text: string, filler = false): Line {
  return { inFrame: at(inSec), outFrame: at(outSec), text, filler };
}

export const assets: Asset[] = [
  {
    id: "a_hook",
    name: "Take 03 — hook",
    kind: "talking",
    duration: at(14),
    tags: ["hook", "founder", "launch", "open"],
    summary: "Founder on a hook. Two false starts, then the line about the first cut.",
    scene: "hook",
    lines: [
      line(0, 0.4, "Um,", true),
      line(0.6, 1.1, "like,", true),
      line(2.2, 6.4, "What if the first cut showed up before the coffee got cold."),
      line(7.6, 8.2, "uh", true),
      line(9.0, 13.2, "That is the edit room I wanted."),
    ],
  },
  {
    id: "a_problem",
    name: "Take 07 — problem",
    kind: "talking",
    duration: at(18),
    tags: ["problem", "time", "notes", "editor"],
    summary: "Why launch films slip. Bins, notes in chat, timeline somewhere else.",
    scene: "problem",
    lines: [
      line(0.2, 0.8, "So,", true),
      line(1.4, 6.8, "A launch film was three weeks of bins, selects, and notes."),
      line(8.6, 9.2, "um", true),
      line(9.6, 14.4, "The director notes lived in a chat. The timeline lived somewhere else."),
      line(15.2, 17.6, "Nothing was frame accurate by the time it came back."),
    ],
  },
  {
    id: "a_walk",
    name: "Take 11 — walkthrough",
    kind: "talking",
    duration: at(16),
    tags: ["product", "timeline", "agent", "editor"],
    summary: "How a brief becomes a cut you can still trim by hand.",
    scene: "walk",
    lines: [
      line(0.4, 1.0, "Okay,", true),
      line(1.6, 6.2, "You brief it the way you would brief a junior editor."),
      line(7.4, 12.8, "Then you still have the timeline. Trim, split, overwrite."),
      line(13.4, 15.6, "The agent proposes. You decide."),
    ],
  },
  {
    id: "a_screen",
    name: "Screen — product UI",
    kind: "screen",
    duration: at(20),
    tags: ["screen", "ui", "timeline", "product", "export"],
    summary: "Screen recording of the edit room. Tracks, playhead, captions, export.",
    scene: "screen",
    lines: [
      line(0.8, 4.5, "Assembly on V1, coverage on V2."),
      line(5.2, 9.0, "Playhead is frame accurate. Thirty frames a second."),
      line(10.0, 14.2, "Captions sit on the dialogue, not on the silences."),
      line(15.0, 19.2, "Export an EDL when the cut is ready to leave the browser."),
    ],
  },
  {
    id: "a_city",
    name: "B-roll — city morning",
    kind: "broll",
    duration: at(8),
    tags: ["broll", "city", "morning", "establish"],
    summary: "Wide city, early light. Establishing coverage.",
    scene: "city",
    lines: [],
  },
  {
    id: "a_hands",
    name: "B-roll — hands on keys",
    kind: "broll",
    duration: at(6),
    tags: ["broll", "hands", "desk", "detail"],
    summary: "Close detail of hands on a keyboard.",
    scene: "hands",
    lines: [],
  },
  {
    id: "a_customer",
    name: "Customer — Nia",
    kind: "talking",
    duration: at(12),
    tags: ["customer", "proof", "quote", "testimonial", "ads"],
    summary: "Customer on shipping three variants, and still owning the selects.",
    scene: "customer",
    lines: [
      line(0.3, 0.9, "Yeah,", true),
      line(1.4, 5.8, "We shipped three ad variants before lunch."),
      line(6.6, 11.4, "I still pulled the selects myself. That part mattered."),
    ],
  },
  {
    id: "a_music",
    name: "Score — room tone bed",
    kind: "music",
    duration: at(48),
    tags: ["music", "bed", "score"],
    summary: "Low bed under the launch film. No dialogue.",
    scene: "score",
    lines: [],
  },
];

function assembly(): Sequence {
  const v1 = ["a_hook", "a_problem", "a_walk", "a_screen", "a_customer"];
  let cursor = 0;
  const clips = v1.map((assetId) => {
    const asset = assets.find((item) => item.id === assetId)!;
    const clip = {
      id: `c_${assetId}`,
      assetId,
      trackId: "v1",
      start: cursor,
      srcIn: 0,
      srcOut: asset.duration,
    };
    cursor += asset.duration;
    return clip;
  });

  const city = assets.find((item) => item.id === "a_city")!;
  const hands = assets.find((item) => item.id === "a_hands")!;
  const music = assets.find((item) => item.id === "a_music")!;

  clips.push(
    {
      id: "c_city",
      assetId: city.id,
      trackId: "v2",
      start: at(12),
      srcIn: 0,
      srcOut: city.duration,
    },
    {
      id: "c_hands",
      assetId: hands.id,
      trackId: "v2",
      start: at(40),
      srcIn: 0,
      srcOut: hands.duration,
    },
    {
      id: "c_music",
      assetId: music.id,
      trackId: "a1",
      start: 0,
      srcIn: 0,
      srcOut: music.duration,
    },
  );

  return {
    id: "seq_assembly",
    name: "Assembly — rough",
    tracks: baseTracks(),
    clips,
    captions: [],
  };
}

export function createProject(): Project {
  return {
    name: "Launch film",
    fps: FPS,
    aspect: "16:9",
    assets,
    sequences: [assembly()],
  };
}

export function assetById(project: Project, id: string): Asset | undefined {
  return project.assets.find((asset) => asset.id === id);
}
