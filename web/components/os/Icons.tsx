/** Stroke icons for the shell. Decorative: the label beside each icon carries the meaning. */
type P = { size?: number };
const base = (size: number) => ({ width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true });

export const IconToday = ({ size = 20 }: P) => (
  <svg {...base(size)}><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></svg>
);
export const IconPond = ({ size = 20 }: P) => (
  <svg {...base(size)}><path d="M3 9c2 0 2-1.5 4.5-1.5S9.5 9 12 9s2-1.5 4.5-1.5S19 9 21 9M3 15c2 0 2-1.5 4.5-1.5S9.5 15 12 15s2-1.5 4.5-1.5S19 15 21 15" /></svg>
);
export const IconPeople = ({ size = 20 }: P) => (
  <svg {...base(size)}><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19c.8-3.2 3-5 5.5-5s4.7 1.8 5.5 5" /><circle cx="17" cy="9" r="2.6" /><path d="M16 14.2c2.3.2 3.9 1.9 4.5 4.8" /></svg>
);
export const IconEvents = ({ size = 20 }: P) => (
  <svg {...base(size)}><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>
);
export const IconDesk = ({ size = 20 }: P) => (
  <svg {...base(size)}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /></svg>
);
export const IconSetup = ({ size = 20 }: P) => (
  <svg {...base(size)}><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>
);
export const IconMic = ({ size = 20 }: P) => (
  <svg {...base(size)}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
);
export const IconSend = ({ size = 18 }: P) => (
  <svg {...base(size)}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);
export const IconLock = ({ size = 14 }: P) => (
  <svg {...base(size)}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
);
export const IconCheck = ({ size = 14 }: P) => (
  <svg {...base(size)} strokeWidth={2.2}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
);
export const IconLink = ({ size = 16 }: P) => (
  <svg {...base(size)}><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></svg>
);
export const IconSearch = ({ size = 16 }: P) => (
  <svg {...base(size)}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></svg>
);
