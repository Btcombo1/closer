/** Shared Be Present challenges. Written to both of them, never to one person. */

export const INTRO =
  "A shared goal for both of you: more minutes when the phones are down and you are actually with each other. Nobody is the distracted one. You live in the same house as these devices. A missed day is just a missed day, not a debt.";

export const CHALLENGES = [
  {
    id: "meal",
    title: "A phone-free meal",
    detail: "One meal together, both phones in another room. Talk about anything ordinary. The food can be simple.",
  },
  {
    id: "basket",
    title: "A phone basket",
    detail: "Put a basket or bowl out for the stretch of time you are together. Both phones go in. Either of you can set it out.",
  },
  {
    id: "first15",
    title: "The first 15 minutes",
    detail: "The first 15 minutes you are both home and awake, the phones stay down. Coffee counts.",
  },
  {
    id: "last15",
    title: "The last 15 minutes",
    detail: "The last 15 minutes before one of you sleeps, phones charge outside the room if you can. If not, face-down in a drawer is enough.",
  },
  {
    id: "eyes",
    title: "An eye-contact check-in",
    detail: "Sixty seconds, face to face. One question between you: how is your heart right now? Then you can stop.",
  },
  {
    id: "walk",
    title: "A short walk, phones left inside",
    detail: "Ten minutes outside or down the hall and back. No podcast, no map. Just the walk.",
  },
  {
    id: "hour",
    title: "One hour in another room",
    detail: "Both devices live in another room for one hour of your evening. A timer in the kitchen is allowed. Scrolling is not.",
  },
  {
    id: "coffee",
    title: "Coffee without a screen",
    detail: "The first cup, together or overlapping, with no screen in hand. Looking at each other once is enough.",
  },
];

export const RECONNECT = [
  { id: "hug", title: "Twenty-second hug", detail: "Phones in pockets, not in hands. Stay for one slow breath longer than usual." },
  { id: "breath", title: "Three shared breaths", detail: "Stand or sit close. Breathe in together, out together, three times. Then carry on." },
  { id: "knee", title: "Knee to knee", detail: "One ordinary sentence each about the day. No fixing." },
  { id: "water", title: "A glass of water", detail: "Hand the other a glass and stay through the first sip." },
  { id: "sky", title: "One minute of sky", detail: "Step to a window or the porch. Look up, not at a screen." },
  { id: "specific", title: "One specific thanks", detail: "Name one small thing the other did in the last day. Keep it concrete." },
  { id: "breath-eyes", title: "One breath of eye contact", detail: "As long as a slow exhale. A smile if it is there. No performance." },
  { id: "question", title: "One question, phones elsewhere", detail: "Basket first. Then: what would make the rest of today feel kinder?" },
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
  "Sit together for five minutes with both phones in another room. You do not have to talk the whole time.",
  "Make two drinks and drink the first sip in the same room, screens down.",
  "Step outside or to a window and name one thing you both see.",
  "A twenty-second hug, then one ordinary sentence about the day.",
  "Put the phones in a basket and play one song all the way through.",
];

export function fallbackTogether(index = 0) {
  return TOGETHER_FALLBACK[Math.abs(index) % TOGETHER_FALLBACK.length];
}
