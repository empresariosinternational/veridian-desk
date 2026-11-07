export type ChatMessage = {
  id: string;
  from: "me" | "them";
  text: string;
  at: string;
};

export type ChatPeer = {
  id: string;
  name: string;
  avatar?: string | null;
};

/** Demo peers for hackathon — matched loosely by name. */
const DEMO_PEER_KEYS = ["mysha", "josh"] as const;

export function isDemoChatPeer(name: string): boolean {
  const n = name.trim().toLowerCase();
  return DEMO_PEER_KEYS.some((key) => n.includes(key));
}

export function getDemoThread(peerName: string): ChatMessage[] {
  const n = peerName.trim().toLowerCase();
  if (n.includes("mysha")) {
    return [
      { id: "m1", from: "them", text: "you coming to maman mornings friday?", at: "2:14 PM" },
      { id: "m2", from: "me", text: "yes — coral gables, right?", at: "2:16 PM" },
      { id: "m3", from: "them", text: "yeah. I'll save you a spot by the window.", at: "2:17 PM" },
    ];
  }
  if (n.includes("josh")) {
    return [
      { id: "j1", from: "me", text: "that canopy after party looks fun", at: "11:02 AM" },
      { id: "j2", from: "them", text: "pull up — half the scene will be there.", at: "11:08 AM" },
    ];
  }
  return [];
}

const AUTO_REPLIES: Record<string, string[]> = {
  mysha: [
    "perfect — see you friday!",
    "just sent the luma link to your phone.",
    "coral gables crew is stacking up.",
  ],
  josh: [
    "doors at 8 — come through.",
    "I'll intro you to a few hosts.",
    "yeah it's the move this week.",
  ],
};

export function pickAutoReply(peerName: string): string {
  const n = peerName.trim().toLowerCase();
  const key = n.includes("mysha") ? "mysha" : n.includes("josh") ? "josh" : "mysha";
  const pool = AUTO_REPLIES[key];
  return pool[Math.floor(Math.random() * pool.length)];
}

export function nowLabel(): string {
  return new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function newId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
