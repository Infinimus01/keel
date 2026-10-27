# Keel

A browser edit room. You brief a first cut the way you would brief a junior editor, then you finish it on a timeline.

Keel is a study of that handoff. The brief does not return a paragraph. It returns a plan, and Apply writes an edit decision list you can still trim, split, and undo.

The room opens on a rough assembly of a launch film: talking takes with fillers left in, coverage, a screen recording, and a music bed. No upload step. The picture is a storyboard proxy keyed to each clip's transcript, so the edit math can be real without pretending to decode camera originals.

## Edit model

Time is an integer frame at 30 fps. A clip is an asset, a track, a timeline start, and a source in/out. Nothing is destructive to the source. Tracks are V2 (coverage), V1 (dialogue and picture), and A1 (music). The program monitor shows the highest video clip under the playhead. Captions are their own spans, not burned into the clip.

Reframe is a center crop of the same composition — 16:9, 1:1, or 9:16. The timeline does not move. Export records the frame size.

## What a brief can do

The planner is deterministic on purpose. The same sentence does the same thing twice, and the operation is undoable as one step.

| Brief | What it writes |
| --- | --- |
| Remove silences and ums | Drops filler words and gaps longer than half a second on clips that have a transcript, then ripples that track closed. B-roll and music stay where they were. |
| 30s hook-first recap | A new sequence. Opens on the hook line, then problem, product, and proof, with short b-roll breaths if the target has room. It will not pad with silence to hit the number. |
| Cut this into 3 ads | Three sequences: problem, product, proof. The assembly stays in the sequence menu. |
| Add captions | Non-filler V1 lines, in timeline time. |
| Reframe to 9:16 | Center crop only. |
| Tighten | Eight percent off both handles, never under twelve frames, then ripple. |

You can also drag a clip, trim either handle, snap to the playhead or a neighboring cut, split, and lift-delete (the gap stays). Drop footage from the bin onto a track. If the drop point is occupied, the clip goes to the end of that track.

Search matches transcript, summary, and tags — not just the file name. Try "coffee", "testimonial", or "screen".

## Keys

Space plays. K stops. L and J shuttle forward and back, and repeat to go 2×, 4×, 8×. Arrows nudge one frame, shift-arrows nudge ten. S splits at the playhead. Delete lifts the selected clip. Undo is the usual shortcut.

## Interchange

Three exports of the active sequence:

- **EDL** — CMX3600-style events for every clip, with source and record timecode, plus caption lines.
- **FCPXML 1.9** — V1 as the spine, gaps included. V2 and A1 are in the EDL; a connected storyline is the natural next step, and it is not faked here.
- **JSON** — the sequence, the assets it uses, frame rate, and frame size.

## What is intentionally not here

There is no WebCodecs decode and no claim of one. Coverage is not linked to dialogue, so a ripple on V1 does not drag V2 with it. The director is not a chat model. A model can sit in front of this later. It should still emit these operations, not a free-text description of a cut nobody can scrub.

## Run

```bash
npm install
npm run dev
npm test
```

Tests cover silence removal, the hook-first recap, the three ad sequences, captions skipping fillers, and both export formats.
