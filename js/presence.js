/** Phone-down ideas each person can do alone. Never a step in the path. */

export const INTRO =
  "This is optional, and it is yours alone. Put your own phone down for a few minutes when you can. You do not have to be in the same place, and a missed day is not a debt.";

export const CHALLENGES = [
  {
    id: "meal",
    title: "One meal without your phone",
    detail: "Eat one meal with your phone in another room, even if you are eating alone. Ordinary food is enough.",
  },
  {
    id: "basket",
    title: "Your phone, out of reach",
    detail: "For a little while, leave your phone in a drawer or another room. You do not need anyone else to do it with you.",
  },
  {
    id: "first15",
    title: "The first 15 minutes",
    detail: "The first 15 minutes you are awake and free, leave your phone down. Coffee counts.",
  },
  {
    id: "last15",
    title: "The last 15 minutes",
    detail: "The last 15 minutes before you sleep, charge the phone away from your hand if you can.",
  },
  {
    id: "eyes",
    title: "One quiet check-in with yourself",
    detail: "Sixty seconds. Ask yourself: how is my heart right now? Then you can stop.",
  },
  {
    id: "walk",
    title: "A short walk, phone left inside",
    detail: "Ten minutes outside, or down the hall and back. No podcast. Just the walk.",
  },
  {
    id: "hour",
    title: "One hour in another room",
    detail: "Leave your phone in another room for one hour of your evening. A kitchen timer is fine.",
  },
  {
    id: "coffee",
    title: "Coffee without a screen",
    detail: "The first cup, with no screen in your hand. You can be alone for it.",
  },
];

export const RECONNECT = [
  { id: "note", title: "One kind sentence", detail: "Write one ordinary kind sentence. Send it only if you want. No reply is required." },
  { id: "breath", title: "Three slow breaths", detail: "On your own, breathe in and out three times. Then carry on." },
  { id: "water", title: "A glass of water", detail: "Drink a glass of water away from your phone." },
  { id: "sky", title: "One minute of sky", detail: "Step to a window. Look up, not at a screen." },
  { id: "specific", title: "One specific thanks", detail: "Name one small thing the other person did. You can write it here and they will see it when they open the app." },
  { id: "pause", title: "One pause", detail: "Set the phone down for as long as one slow breath. Then pick it up if you need it." },
  { id: "question", title: "One question, for later", detail: "Write one gentle question. It can wait until the other person has time." },
  { id: "music", title: "One song, just for you", detail: "Play one song all the way through. No second screen." },
];

export function hashISO(iso) {
  let n = 0;
  for (let i = 0; i < iso.length; i++) n = (n * 33 + iso.charCodeAt(i)) >>> 0;
  return n;
}

export function challengeFor(iso) {
  return CHALLENGES[hashISO(iso) % CHALLENGES.length];
}

export function reconnectFor(iso, count = 3) {
  const start = hashISO(iso) % RECONNECT.length;
  return Array.from({ length: count }, (_, i) => RECONNECT[(start + i) % RECONNECT.length]);
}

export const TOGETHER_FALLBACK = [
  "Put your own phone down for five minutes. You do not have to be with anyone.",
  "Make a drink and take the first sip away from a screen.",
  "Step to a window and name one thing you see.",
  "Write one ordinary sentence about your day, then stop.",
  "Play one song all the way through, just for you.",
];

export function fallbackTogether(index = 0) {
  return TOGETHER_FALLBACK[Math.abs(index) % TOGETHER_FALLBACK.length];
}
