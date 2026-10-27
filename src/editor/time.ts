import { FPS } from "./types.ts";

export function framesToTc(frames: number, fps = FPS): string {
  const rounded = Math.max(0, Math.floor(frames));
  const f = rounded % fps;
  const totalSec = Math.floor(rounded / fps);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60) % 60;
  const h = Math.floor(totalSec / 3600);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}:${pad(f)}`;
}

export function framesToShort(frames: number, fps = FPS): string {
  const s = Math.max(0, Math.round(frames / fps));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function framesToRate(frames: number, fps = FPS): string {
  return `${frames}/${fps}s`;
}
