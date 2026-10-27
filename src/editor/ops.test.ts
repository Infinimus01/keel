import assert from "node:assert/strict";
import test from "node:test";
import { applyCommand, parseCommand } from "./agent.ts";
import { toEdl, toFcpXml } from "./export.ts";
import { hasOverlap, removeSilences, speechRanges } from "./ops.ts";
import { createProject } from "./project.ts";
import { makeIdGen, sequenceEnd, type Asset } from "./types.ts";

test("speech ranges drop fillers and keep the hook lines", () => {
  const project = createProject();
  const hook = project.assets.find((asset) => asset.id === "a_hook") as Asset;
  const ranges = speechRanges(hook, 0, hook.duration, true, 15);
  assert.equal(ranges.length, 2);
  assert.ok(ranges.every((range) => range.in > 12));
});

test("remove silences shortens the assembly and drops the opening um", () => {
  const project = createProject();
  const seq = project.sequences[0];
  const before = sequenceEnd(seq);
  const next = removeSilences(seq, project.assets, { minGap: 15, dropFillers: true }, makeIdGen("t"));
  assert.ok(sequenceEnd(next) < before);
  const hookClips = next.clips.filter((clip) => clip.assetId === "a_hook");
  assert.ok(hookClips.every((clip) => clip.srcIn > 6 || clip.srcOut <= 6));
  assert.equal(hasOverlap(next.clips), false);
});

test("hook-first recap stays inside the target and does not overlap", () => {
  const project = createProject();
  const result = applyCommand(project, project.sequences[0].id, { type: "recap", seconds: 30, hookFirst: true }, makeIdGen("t"));
  const seq = result.project.sequences.find((item) => item.id === result.activeSequenceId);
  assert.ok(seq);
  assert.ok(sequenceEnd(seq) <= 30 * project.fps + 2);
  assert.equal(hasOverlap(seq.clips), false);
  const first = seq.clips.filter((clip) => clip.trackId === "v1").sort((a, b) => a.start - b.start)[0];
  assert.equal(first.assetId, "a_hook");
});

test("three ad variants land as separate sequences", () => {
  const project = createProject();
  const result = applyCommand(project, project.sequences[0].id, { type: "ads" }, makeIdGen("t"));
  const names = result.project.sequences.map((seq) => seq.name);
  assert.ok(names.includes("Ad — problem"));
  assert.ok(names.includes("Ad — product"));
  assert.ok(names.includes("Ad — proof"));
  for (const seq of result.project.sequences) assert.equal(hasOverlap(seq.clips), false);
});

test("captions skip fillers", () => {
  const project = createProject();
  const result = applyCommand(project, project.sequences[0].id, { type: "captions" }, makeIdGen("t"));
  const seq = result.project.sequences[0];
  assert.ok(seq.captions.length > 3);
  assert.ok(seq.captions.every((cap) => !/^um,?$|^uh$|^like,$|^so,$|^okay,$|^yeah,$/i.test(cap.text)));
});

test("parser and interchange", () => {
  assert.equal(parseCommand("remove all the ums").command.type, "remove-silence");
  assert.deepEqual(parseCommand("make a 45 second recap").command, { type: "recap", seconds: 45, hookFirst: true });
  const project = createProject();
  const seq = project.sequences[0];
  assert.match(toEdl(project, seq), /Take 03 — hook/);
  assert.match(toFcpXml(project, seq), /<asset-clip /);
});
