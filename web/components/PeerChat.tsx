"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import VeridianMark from "@/components/VeridianMark";
import {
  type ChatMessage,
  type ChatPeer,
  getDemoThread,
  isDemoChatPeer,
  newId,
  nowLabel,
  pickAutoReply,
} from "@/lib/chat-demo";

type Props = {
  peer: ChatPeer | null;
  onClose: () => void;
};

export default function PeerChat({ peer, onClose }: Props) {
  const reduce = useReducedMotion();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!peer) return;
    setDraft("");
    setConnecting(true);
    setConnected(false);
    setMessages(getDemoThread(peer.name));
    const t = setTimeout(() => {
      setConnecting(false);
      setConnected(true);
      inputRef.current?.focus();
    }, 650);
    return () => clearTimeout(t);
  }, [peer]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: reduce ? "auto" : "smooth" });
  }, [messages, reduce]);

  useEffect(() => {
    if (!peer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [peer, onClose]);

  const send = useCallback(() => {
    const text = draft.trim();
    if (!text || !peer || !connected) return;
    const mine: ChatMessage = { id: newId(), from: "me", text, at: nowLabel() };
    setMessages((prev) => [...prev, mine]);
    setDraft("");
    window.setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        { id: newId(), from: "them", text: pickAutoReply(peer.name), at: nowLabel() },
      ]);
    }, 900 + Math.random() * 600);
  }, [draft, peer, connected]);

  if (!peer || !isDemoChatPeer(peer.name)) return null;

  return (
    <AnimatePresence>
      {peer && (
        <>
          <motion.button
            type="button"
            className="chat-backdrop"
            aria-label="close chat"
            initial={reduce ? false : { opacity: 0 }}
            animate={reduce ? undefined : { opacity: 1 }}
            exit={reduce ? undefined : { opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
          />
          <motion.aside
            className="chat-panel"
            role="dialog"
            aria-modal="true"
            aria-label={`chat with ${peer.name}`}
            initial={reduce ? false : { x: "100%" }}
            animate={reduce ? undefined : { x: 0 }}
            exit={reduce ? undefined : { x: "100%" }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          >
            <header className="chat-head">
              <div className="chat-peer">
                {peer.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="chat-peer-avatar" src={peer.avatar} alt="" />
                ) : (
                  <span className="chat-peer-avatar chat-peer-fallback" aria-hidden="true">
                    {peer.name.trim().charAt(0).toUpperCase()}
                  </span>
                )}
                <div>
                  <div className="chat-peer-name">{peer.name}</div>
                  <div className="chat-peer-status">
                    <span className={`chat-p2p-dot${connected ? " on" : ""}`} aria-hidden="true" />
                    <VeridianMark size={11} />
                    {connecting ? "veridian handshake…" : "veridian P2P · encrypted · demo"}
                  </div>
                </div>
              </div>
              <button type="button" className="chat-close" onClick={onClose} aria-label="close">
                ×
              </button>
            </header>

            <div className="chat-thread" ref={scrollRef}>
              <div className="chat-demo-note">
                veridian demo — messages stay on-device, no server
              </div>
              {messages.map((m) => (
                <div key={m.id} className={`chat-bubble-row ${m.from}`}>
                  <div className="chat-bubble">
                    <p>{m.text}</p>
                    <time>{m.at}</time>
                  </div>
                </div>
              ))}
            </div>

            <footer className="chat-compose">
              <input
                ref={inputRef}
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") send(); }}
                placeholder={connected ? "message…" : "connecting…"}
                disabled={!connected}
                aria-label="message"
              />
              <button type="button" onClick={send} disabled={!connected || !draft.trim()}>
                send
              </button>
            </footer>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
