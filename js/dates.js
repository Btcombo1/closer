/**
 * Date-night library. To add an idea later (including ones from your own notes),
 * append an object to DATE_IDEAS or save it from the app into state.customIdeas.
 *
 * length: '5' | '10' | 'day' | 'night' | 'overnight'
 * setting: 'home' | 'low-cost' | 'outdoors' | 'upstate' | 'blueridge' | 'lake'
 */

export const LENGTHS = [
  { id: "5", label: "5 minutes" },
  { id: "10", label: "10 minutes" },
  { id: "day", label: "Day date" },
  { id: "night", label: "Night date" },
  { id: "overnight", label: "Overnight" },
];

export const SETTINGS = [
  { id: "home", label: "At home" },
  { id: "low-cost", label: "Low-cost" },
  { id: "outdoors", label: "Outdoors" },
  { id: "lake", label: "Lake" },
  { id: "upstate", label: "Upstate SC" },
  { id: "blueridge", label: "Blue Ridge" },
];

export const WHEN_LABEL = {
  "before-shift": "Before the shift",
  "evening-after-sleep": "Evening, after sleep",
  daytime: "Daytime",
  evening: "Evening",
  "easy-evening": "An easy evening",
  small: "A small pocket of time",
  "off-stretch": "A night off, with the next night off too",
};

export const DATE_IDEAS = [
  { id: "doorway-hug", title: "Hug at the door", length: "5", setting: "home", summary: "Before he leaves for shift, a real hug and one sentence: I'll be glad when you're home.", steps: ["Phones stay in pockets.", "Whoever is leading starts the hug.", "One sentence, then he can go."] },
  { id: "one-song", title: "One song, all the way through", length: "5", setting: "home", summary: "The leader picks a song. You both listen. No skipping, no second screen.", steps: ["Leader queues the song.", "Sit or sway for the whole track.", "Say one line about why you chose it."] },
  { id: "six-words", title: "Six-word check-in", length: "5", setting: "home", summary: "When you both have a free minute: six words each for how you are. Then you stop.", steps: ["Only when you are both free.", "Six words each.", "No follow-up questions unless invited."] },
  { id: "porch-sip", title: "First sip, when you are both free", length: "5", setting: "home", summary: "Tea, coffee, or water. For a time you are actually both free.", steps: ["Whoever is free first can pour.", "Phones can wait.", "One quiet minute is enough."] },
  { id: "photo-minute", title: "One good photo", length: "5", setting: "home", summary: "Open one photo from a year that was kind. Say what you remember. Then close it.", steps: ["Leader picks the photo.", "One memory, a few sentences.", "Put the phone away again."] },
  { id: "compliment-door", title: "A specific compliment", length: "5", setting: "home", summary: "Not 'you look nice.' One thing you saw the other do, said out loud before the day scatters.", steps: ["Leader goes first.", "Name the action, not a grade.", "The other only has to say thank you."] },
  { id: "block-walk", title: "To the end of the block", length: "10", setting: "outdoors", summary: "Ten minutes, no phones in hand. Out and back.", steps: ["Leave phones inside or deep in a pocket.", "Leader picks the direction.", "One question on the way, easy."] },
  { id: "snack-plate", title: "A snack plate", length: "10", setting: "home", summary: "Something small on one plate. You share it. That is the date.", steps: ["Leader assembles the plate.", "Sit at a table, not in front of a show.", "Phones in the basket."] },
  { id: "verse-aloud", title: "One verse, when you have time", length: "10", setting: "home", summary: "When you are both free, one of you reads a verse. The other says what word stayed.", steps: ["Only if you are both free.", "Read slowly.", "One word each."] },
  { id: "playlist-question", title: "A song and a question", length: "10", setting: "home", summary: "The leader made this tiny plan: one song, one light question.", steps: ["Play the song.", "Ask the question.", "Answer in a few sentences, then you can stop."] },
  { id: "stretch", title: "Stretch on the floor", length: "10", setting: "home", summary: "Shoulders, neck, a forward fold. No workout. Just unknot beside each other.", steps: ["Leader starts.", "No instruction voice unless asked.", "End sitting up, one breath."] },
  { id: "window-sit", title: "Window or porch sit", length: "10", setting: "home", summary: "Ten minutes of the same view. You may talk or not.", steps: ["Leader picks the seat.", "Phones elsewhere.", "Stay the whole ten."] },
  { id: "falls-park", title: "Falls Park and a treat", length: "day", setting: "upstate", summary: "Liberty Bridge, the falls, and one ice cream or coffee in downtown Greenville. Then you go home.", steps: ["Leader handles parking and the treat.", "Phones for a single photo if you want, then away.", "Leave before you are tired of it."] },
  { id: "swamp-rabbit", title: "Swamp Rabbit, short and sweet", length: "day", setting: "upstate", summary: "A piece of the trail toward Travelers Rest. Split a pastry. Turn around before it becomes a project.", steps: ["Leader picks the start.", "One way, then back.", "A pastry counts as the meal."] },
  { id: "paris-mountain", title: "Paris Mountain picnic", length: "day", setting: "outdoors", summary: "A short loop and a picnic you packed. The view is the point, not the mileage.", steps: ["Leader packs the food.", "Choose the easy path.", "Eat before you decide to go farther."] },
  { id: "keowee", title: "Lake Keowee shoreline", length: "day", setting: "lake", summary: "Chairs, snacks, and a stretch of water. No agenda past sitting.", steps: ["Leader loads the car.", "Stay as long as it feels good.", "A photo if you want it in the album."] },
  { id: "hartwell", title: "Lake Hartwell afternoon", length: "day", setting: "lake", summary: "A low-cost shoreline hour. Bring fruit and something to drink.", steps: ["Leader picks the access.", "Phones in the basket in the car.", "One walk along the edge."] },
  { id: "table-rock", title: "Table Rock, the easy way", length: "day", setting: "outdoors", summary: "The park, not a summit unless you both want it. A picnic and the mountain in view is a full date.", steps: ["Leader checks the simple plan.", "Turn around while you still like each other.", "Dinner can be leftovers."] },
  { id: "market-cook", title: "Market, then one meal", length: "day", setting: "low-cost", summary: "Buy a few things and cook them together. One project. Then you stop.", steps: ["Leader holds the short list.", "Cook side by side.", "Eat it. Leave the rest of the dishes for later if you need to."] },
  { id: "bookstore", title: "Bookstore or downtown walk", length: "day", setting: "low-cost", summary: "Greenville or Travelers Rest. Each picks one small thing to show the other. You do not have to buy it.", steps: ["Leader names the place.", "A time to leave, set at the start.", "One shared drink."] },
  { id: "cook-night", title: "One recipe, phones in the basket", length: "night", setting: "home", summary: "An off night. One new or favorite recipe. The leader shops and starts it.", steps: ["Basket by the door first.", "Cook together.", "A question card only if you want one."] },
  { id: "milkshake-drive", title: "A drive and a milkshake", length: "night", setting: "low-cost", summary: "A playlist the leader made. A drive that ends at a milkshake or a soda. Home before it is late.", steps: ["Leader drives or navigates.", "One stop.", "The playlist can be short."] },
  { id: "floor-movie", title: "A movie on the floor", length: "night", setting: "home", summary: "Blankets, one film you both actually like, pause once in the middle for a sentence.", steps: ["Leader picks the film.", "Phones in another room.", "Pause halfway: one thing you like about this."] },
  { id: "card-compliment", title: "Cards, and the loser is complimented", length: "night", setting: "home", summary: "A simple game. The winner names one thing they admire. Keep it light.", steps: ["Leader deals.", "Play short.", "End while it is still fun."] },
  { id: "early-date", title: "A cheap echo of 2018", length: "night", setting: "low-cost", summary: "Recreate one inexpensive thing from when you were first together. It does not have to be accurate.", steps: ["Leader proposes the echo.", "Do a small version.", "Say one thing that is still true."] },
  { id: "stars", title: "Stars outside town", length: "night", setting: "outdoors", summary: "A dark pull-off or the backyard if that is what you have. Ten quiet minutes count.", steps: ["Leader picks the spot and the time home.", "No identifying constellations required.", "A blanket if it is cool."] },
  { id: "dessert-candles", title: "Dessert only", length: "night", setting: "home", summary: "Not a big dinner. Something sweet, a candle if you like one, and the house a little quieter.", steps: ["Leader handles dessert.", "Sit at the table.", "Phones elsewhere."] },
  { id: "guest-night", title: "You are the guest", length: "night", setting: "home", summary: "The leader takes charge of the whole evening. The other person is a guest in their own house.", steps: ["Leader decides the plan and the pace.", "Guest does not manage it.", "End at a time you named."] },
  { id: "brevard", title: "Brevard, one night", length: "overnight", setting: "blueridge", summary: "A simple room near Pisgah on a Tue–Wed or similar stretch off. No packed list. Walk, eat, sleep.", steps: ["Leader books the simplest place.", "One walk.", "Home in time for the next shift, unrushed.", "If the house needs you, do the staycation version instead."] },
  { id: "parkway", title: "A piece of the Parkway", length: "overnight", setting: "blueridge", summary: "Little Switzerland, Blowing Rock, or a pull-off you like. One night, one diner, one view.", steps: ["Leader picks the stop.", "Leave room to sit still.", "The drive home is part of the date, not a race."] },
  { id: "staycation", title: "Staycation overnight", length: "overnight", setting: "home", summary: "If kids or grandkids need the house covered, this is a real overnight: evening and morning treated like a tiny trip.", steps: ["Leader sets the 'we have arrived' moment.", "Phones in a basket from dinner to breakfast.", "Breakfast is slow."] },
  { id: "devils-fork", title: "A cabin night by the water", length: "overnight", setting: "lake", summary: "Devil's Fork, a state park cabin, or any simple lakeside room on nights he is off. Swimming optional.", steps: ["Leader checks the nights against the shift.", "One meal you didn't fuss over.", "A morning with nothing planned."] },
  { id: "asheville-easy", title: "Asheville, easy on purpose", length: "overnight", setting: "blueridge", summary: "One neighborhood, one good meal, an early night. Not a tour of the whole city.", steps: ["Leader chooses the neighborhood.", "Say no to the second activity.", "Leave so the drive is kind."] },
];

export function allIdeas(custom = []) {
  return DATE_IDEAS.concat(custom || []).filter((idea) => idea && !idea.removed);
}

export function ideaById(id, custom = []) {
  return allIdeas(custom).find((idea) => idea.id === id) || null;
}

export const LEADER_NOTE =
  "The leader plans it, presents it, and takes charge of the small frictions. The other person's job is to show up and be a guest.";
