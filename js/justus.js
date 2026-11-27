/**
 * Just Us — optional, private to the two of you, never on the schedule unless you add it.
 * Extend with state.justUs.ideas or by appending to IDEAS.
 * Keep additions classy. This list is not explicit on purpose.
 */

export const INTRO =
  "This room is optional. Nothing in it is expected, tracked, or owed. It is for a married couple who want closeness to feel safer, especially when Tabby wants to set the pace or take the lead. No is a complete answer. Maybe means not tonight.";

export const IDEAS = [
  {
    id: "her-choice",
    title: "Her-choice night",
    summary: "Tabby decides if the evening is for closeness, what it includes, and when it ends. Brandon follows. She can change her mind at any point, including toward stopping.",
  },
  {
    id: "only-kissing",
    title: "A night that stays at kissing",
    summary: "Closeness with a clear edge: kissing, closeness, and then stop. The limit is the plan, not a disappointment.",
  },
  {
    id: "she-invites",
    title: "He waits to be invited",
    summary: "Brandon does not start. Tabby invites, with words or by reaching. If the invitation does not come, the night is still a good night.",
  },
  {
    id: "lights",
    title: "She sets the room",
    summary: "Lights, music, door, pace. Her taste is the plan. He joins the room she made.",
  },
  {
    id: "words-lead",
    title: "Leading with words",
    summary: "She practices saying what she wants in plain language: slower, closer, pause, that is enough. He does that and nothing extra.",
  },
  {
    id: "compliment-close",
    title: "Compliments that stay kind",
    summary: "He tells her one true thing about who she is in this part of their life. Not a performance review. She can save it here.",
  },
  {
    id: "stop-and-stay",
    title: "Stop and stay",
    summary: "You get close, and then you choose cuddling or sleep instead. Stopping is a successful evening.",
  },
  {
    id: "morning",
    title: "A quiet morning",
    summary: "If the house allows, ten unrushed minutes in the morning. She decides whether it stays tender or becomes more.",
  },
];

export const PROMPTS = [
  { id: "safe-lead", title: "What would taking the lead look like if it did not have to be a performance?" },
  { id: "comfort", title: "What helps you feel at ease in your own skin with each other?" },
  { id: "pace", title: "What pace feels kind right now, and what pace is too much?" },
  { id: "invite", title: "How do you want an invitation to sound, from either of you?" },
  { id: "stop", title: "What should happen, with no discussion, the moment one of you says stop?" },
  { id: "pride", title: "Is there any tenderness in being each other's person in this part of life? If not tonight, that is an honest answer." },
];

export const LIST = [
  { id: "pace", group: "Pace", label: "She sets the pace, and it can change" },
  { id: "invite", group: "Pace", label: "He waits until she invites" },
  { id: "words", group: "Pace", label: "She leads with words" },
  { id: "kissing", group: "Closeness", label: "A night that is only kissing" },
  { id: "slow", group: "Closeness", label: "Slow undressing, and she can keep something on" },
  { id: "massage", group: "Closeness", label: "A back or shoulder massage with no goal past that" },
  { id: "lights", group: "Room", label: "She chooses the lights and the music" },
  { id: "stop", group: "Safety", label: "Stopping and staying close anyway" },
  { id: "not-tonight", group: "Safety", label: "Saying not tonight, with no reason required" },
  { id: "compliments", group: "Words", label: "Kind compliments during closeness" },
  { id: "further", group: "Closeness", label: "Going further only if she says so in the moment" },
  { id: "morning", group: "Time", label: "Morning closeness, her choice" },
];

export function allIdeas(custom = []) {
  return IDEAS.concat(custom || []).filter((idea) => idea && !idea.removed);
}
