"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import VeridianMark from "@/components/VeridianMark";
import { useVeridian } from "@/components/VeridianContext";
import { cancelSpeech, captureSpeech, primeSpokenAudio, speechRecognition, type VoiceCapture } from "@/lib/desk/browser-voice";
import { IconMic, IconSend } from "./Icons";

/**
 * Option A's dock on Today: type or hold the mic, and the Veridian panel opens
 * beside the page with the answer (spoken back when you talked).
 */
export default function TodayDock({ home = false }: { home?: boolean }) {
  const { ask, open } = useVeridian();
  const [text, setText] = useState("");
  const [lang, setLang] = useState<"en-US" | "es-US">("en-US");
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const capture = useRef<VoiceCapture | null>(null);
  const holding = useRef(false);

  useEffect(() => {
    setSupported(Boolean(speechRecognition()));
    return () => capture.current?.abort();
  }, []);

  const cancel = useCallback(() => {
    holding.current = false;
    capture.current?.abort();
    capture.current = null;
    setListening(false);
  }, []);

  const start = () => {
    if (capture.current) return;
    setNotice(null);
    primeSpokenAudio();
    cancelSpeech();
    holding.current = true;
    try {
      const c = captureSpeech(lang);
      capture.current = c;
      setListening(true);
      void c.result.then((r) => {
        if (capture.current !== c) return;
        if (r.error || r.aborted) {
          capture.current = null;
          holding.current = false;
          setListening(false);
          if (r.error) setNotice(r.error);
        }
      });
    } catch (error) {
      holding.current = false;
      setNotice((error as Error).message);
    }
  };

  const stop = async () => {
    holding.current = false;
    const c = capture.current;
    if (!c) return;
    c.stop();
    const r = await c.result;
    capture.current = null;
    setListening(false);
    if (r.aborted) return;
    if (r.error || !r.text) {
      setNotice(r.error ?? "I didn't hear anything. Hold the mic while you talk.");
      return;
    }
    ask(r.text, "voice");
  };

  const send = () => {
    if (!text.trim()) return;
    ask(text.trim(), "typed");
    setText("");
  };

  return (
    <div className={`os-dock${open ? " is-panel-open" : ""}${home ? " is-home" : ""}`}>
      {notice && <p className="os-dock-notice" role="status">{notice}</p>}
      <form className="os-dock-bar" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <VeridianMark size={18} />
        <label className="vcta-sr-only" htmlFor="os-dock-input">Ask Veridian</label>
        <input id="os-dock-input" value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} placeholder={listening ? "Listening… let go to send" : "Ask anything, or hold the mic and talk"} disabled={listening} autoComplete="off" />
        <button type="button" className="os-dock-lang" onClick={() => setLang(lang === "en-US" ? "es-US" : "en-US")} aria-label={`Voice language: ${lang === "en-US" ? "English" : "Spanish"}. Switch`} disabled={listening}>
          {lang === "en-US" ? "EN" : "ES"}
        </button>
        {text.trim() ? (
          <button type="submit" className="os-dock-mic" aria-label="Send to Veridian"><IconSend /></button>
        ) : (
          <button
            type="button"
            className={`os-dock-mic${listening ? " is-listening" : ""}`}
            disabled={!supported}
            aria-label={supported ? "Hold to talk to Veridian" : "Voice is not available in this browser"}
            title={supported ? "Hold to talk" : "Voice is not available in this browser. You can type."}
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); start(); }}
            onPointerUp={() => void stop()}
            onPointerCancel={cancel}
            onKeyDown={(e) => { if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); start(); } }}
            onKeyUp={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); void stop(); } }}
            onBlur={() => { if (holding.current) cancel(); }}
          >
            <IconMic />
          </button>
        )}
      </form>
    </div>
  );
}
