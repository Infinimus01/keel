import { useState } from "react";
import { useEditor } from "./store";

const SUGGESTIONS = [
  "Remove silences and ums",
  "30s hook-first recap",
  "Cut this into 3 ads",
  "Add captions",
  "Reframe to 9:16",
];

export function Director() {
  const log = useEditor((state) => state.log);
  const plan = useEditor((state) => state.plan);
  const brief = useEditor((state) => state.brief);
  const applyPlan = useEditor((state) => state.applyPlan);
  const dismissPlan = useEditor((state) => state.dismissPlan);
  const [draft, setDraft] = useState("");

  function submit(text: string) {
    const next = text.trim();
    if (!next) return;
    brief(next);
    setDraft("");
  }

  return (
    <aside className="director">
      <div className="pane-head">
        <h2>Director</h2>
      </div>
      <div className="log" aria-live="polite">
        {log.map((line) => (
          <p key={line.id} className={line.role === "you" ? "log-you" : "log-keel"}>
            <span>{line.role === "you" ? "You" : "Keel"}</span>
            {line.text}
          </p>
        ))}
      </div>
      {plan ? (
        <div className="plan">
          <h3>{plan.title}</h3>
          <p>{plan.detail}</p>
          <div className="plan-actions">
            <button type="button" className="btn-primary" onClick={applyPlan}>
              Apply
            </button>
            <button type="button" className="btn-quiet" onClick={dismissPlan}>
              Dismiss
            </button>
          </div>
        </div>
      ) : null}
      <div className="suggestions">
        {SUGGESTIONS.map((suggestion) => (
          <button key={suggestion} type="button" className="chip" onClick={() => submit(suggestion)}>
            {suggestion}
          </button>
        ))}
      </div>
      <form
        className="brief"
        onSubmit={(event) => {
          event.preventDefault();
          submit(draft);
        }}
      >
        <label htmlFor="brief">Brief</label>
        <textarea
          id="brief"
          rows={2}
          value={draft}
          placeholder="Brief the cut"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit(draft);
            }
          }}
        />
        <button type="submit" className="btn-primary">
          Plan
        </button>
      </form>
    </aside>
  );
}
