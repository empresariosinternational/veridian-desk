"use client";

import { useEffect, useRef, useState } from "react";
import { connectArduino, supportsArduino, type ArduinoConnection } from "@/lib/desk/arduino";
import css from "./DeskConsole.module.css";

export default function ArduinoNode({ status, urgent, line, onTrigger, onDisconnect }: {
  status: string;
  urgent: boolean;
  line: string;
  onTrigger: () => void;
  onDisconnect: () => void;
}) {
  const [connection, setConnection] = useState<ArduinoConnection | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [notice, setNotice] = useState("Connect Arduino to enable the sonar microphone trigger.");
  const connectionRef = useRef<ArduinoConnection | null>(null);
  const mounted = useRef(false);
  const callbacks = useRef({ onTrigger, onDisconnect });
  const view = useRef({ status, urgent, line });

  useEffect(() => { callbacks.current = { onTrigger, onDisconnect }; }, [onTrigger, onDisconnect]);
  useEffect(() => {
    view.current = { status, urgent, line };
    void connection?.sendState(status, urgent, line);
  }, [connection, status, urgent, line]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      void connectionRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (!connection) return;
    // Heartbeats also restore status after the Uno resets when USB opens.
    const timer = window.setInterval(() => {
      const current = view.current;
      void connection.sendState(current.status, current.urgent, current.line);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [connection]);

  const connect = async () => {
    if (!supportsArduino()) {
      setNotice("Use desktop Chrome or Edge on HTTPS or localhost to connect Arduino.");
      return;
    }
    setConnecting(true);
    try {
      const next = await connectArduino(() => callbacks.current.onTrigger(), () => {
        connectionRef.current = null;
        if (mounted.current) {
          setConnection(null);
          setNotice("Arduino disconnected. Reconnect to use the sonar trigger.");
          callbacks.current.onDisconnect();
        }
      });
      if (!mounted.current) { await next.close(); return; }
      connectionRef.current = next;
      setConnection(next);
      setNotice("Arduino connected. Arm, then wave 2–20 cm from the sonar. Recording ends after 8 seconds.");
    } catch (error) {
      if (mounted.current) setNotice(error instanceof Error ? error.message : "Could not connect Arduino. Close the Arduino Serial Monitor and try again.");
    } finally {
      if (mounted.current) setConnecting(false);
    }
  };

  return (
    <div>
      <button type="button" className={`${css.btn} ${css.btnSmall}`} disabled={connecting}
        onClick={() => connection ? void connection.close() : void connect()}>
        {connecting ? "Connecting Arduino…" : connection ? "Disconnect Arduino" : "Connect Arduino"}
      </button>
      <p className={css.hint} role="status">{notice}</p>
    </div>
  );
}
