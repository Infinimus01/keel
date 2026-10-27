import { assetById } from "./project";
import { captionAt, lineAt, videoAt } from "./ops";
import { framesToTc } from "./time";
import { useActiveSequence, useEditor } from "./store";

export function Monitor() {
  const project = useEditor((state) => state.project);
  const playhead = useEditor((state) => state.playhead);
  const seq = useActiveSequence();
  const frame = Math.floor(playhead);
  const clip = videoAt(seq, frame);
  const asset = clip ? assetById(project, clip.assetId) : undefined;
  const srcFrame = clip ? clip.srcIn + (frame - clip.start) : 0;
  const line = asset ? lineAt(asset, srcFrame) : null;
  const caption = captionAt(seq, frame);

  return (
    <div className="monitor-stage">
      <div className="monitor-frame" data-aspect={project.aspect}>
        <div className={asset ? `scene-canvas scene-${asset.scene}` : "scene-canvas scene-empty"}>
          {asset?.scene === "screen" ? <ScreenProxy /> : null}
          {asset?.scene === "city" ? <CityProxy /> : null}
          {asset?.scene === "hands" ? <HandsProxy /> : null}
          {asset?.scene === "score" ? <ScoreProxy /> : null}
          {asset && asset.scene !== "screen" && asset.scene !== "city" && asset.scene !== "hands" && asset.scene !== "score" ? (
            <TalkProxy scene={asset.scene} />
          ) : null}
          {asset ? (
            <div className="slate">
              <span>{asset.name}</span>
              <span>{asset.kind}</span>
            </div>
          ) : (
            <div className="slate">
              <span>Keel</span>
              <span>no picture</span>
            </div>
          )}
        </div>
        <div className="burn-tc">{framesToTc(frame, project.fps)}</div>
        {caption ? (
          <p className="burn-caption">{caption.text}</p>
        ) : line ? (
          <p className={line.filler ? "lower-third is-filler" : "lower-third"}>
            {line.filler ? <span className="filler-tag">filler</span> : null}
            {line.text}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function TalkProxy({ scene }: { scene: string }) {
  return (
    <div className={`talk talk-${scene}`}>
      <div className="talk-bg" />
      <div className="talk-shoulder" />
      <div className="talk-head" />
      <div className="talk-shadow" />
    </div>
  );
}

function ScreenProxy() {
  return (
    <div className="ui-proxy">
      <div className="ui-top" />
      <div className="ui-body">
        <div className="ui-side" />
        <div className="ui-preview" />
      </div>
      <div className="ui-tracks">
        <i />
        <i />
        <i />
      </div>
    </div>
  );
}

function CityProxy() {
  return (
    <div className="city-proxy">
      <div className="city-sky" />
      <div className="city-block a" />
      <div className="city-block b" />
      <div className="city-block c" />
      <div className="city-street" />
    </div>
  );
}

function HandsProxy() {
  return (
    <div className="hands-proxy">
      <div className="desk" />
      <div className="keyboard" />
      <div className="hand left" />
      <div className="hand right" />
    </div>
  );
}

function ScoreProxy() {
  return (
    <div className="score-proxy">
      {Array.from({ length: 28 }, (_, i) => (
        <i key={i} style={{ height: `${20 + ((i * 37) % 70)}%` }} />
      ))}
    </div>
  );
}
