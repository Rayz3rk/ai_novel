import React from "react";
import { tonePresets } from "../lib/tonePresets.js";

export function ToneComposer({ value, onChange, placeholder = "输入自定义语气" }) {
  return (
    <div className="tone-composer">
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
      <div className="chip-row">
        {tonePresets.map((tone) => (
          <button key={tone} type="button" onClick={() => onChange(tone)}>
            {tone}
          </button>
        ))}
      </div>
    </div>
  );
}
