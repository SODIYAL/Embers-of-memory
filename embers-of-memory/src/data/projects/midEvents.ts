// Mid-project flavor lines, grouped by progress tier.
// {name} is substituted with the lead scholar's first name.

export const MID_FLAVOR_30: string[] = [
  '{name} has been working late into the evenings. The work is progressing carefully.',
  '{name} fills page after page with notes, crossing out as much as is kept.',
  'Inkpots empty quickly in {name}\'s study. The shape of the work is starting to emerge.',
  '{name} has commissioned new candles from the chandler — three nights in a row.',
  'A visiting scribe asks after {name}, who has been seen at the library before dawn.',
  '{name} stares at a single passage for an hour, then writes nothing.',
  'The cook reports {name} skipping meals; the work has them in its grip.',
];

export const MID_FLAVOR_70: string[] = [
  'The end is in sight. Something interesting is taking shape in {name}\'s hands.',
  '{name} has stopped pacing the cloister. The work, it seems, has found its spine.',
  'Visitors report {name} muttering to themselves at all hours, half-elated, half-haunted.',
  'A draft circulates among the junior scholars; ink-stained hands close it quickly when {name} approaches.',
  '{name} has begun re-reading earlier chapters, marking them with small red ticks.',
  'The binder asks how many copies; {name} answers, then smiles for the first time in weeks.',
];

export interface MidEventChoiceDef {
  prompt: string;
  options: Array<{
    label: string;
    effect: 'push' | 'rest' | 'ignore';
    blurb: string; // what the player sees as a hint
  }>;
}

// Choice event at the ~50% tier
export const MID_CHOICE_EVENTS: MidEventChoiceDef[] = [
  {
    prompt: '{name} has hit a snag. They ask whether to push through the night or set the work aside until morning.',
    options: [
      { label: 'Push through',  effect: 'push',   blurb: 'Speed up, at a cost to wellbeing.' },
      { label: 'Rest the mind', effect: 'rest',   blurb: 'Slower today, but easier tomorrow.' },
      { label: 'Let them decide', effect: 'ignore', blurb: 'Stay out of it.' },
    ],
  },
  {
    prompt: 'A rival\'s circular has reached {name}\'s desk, contradicting a passage already drafted. They ask how to handle it.',
    options: [
      { label: 'Sharpen the argument', effect: 'push',   blurb: 'A more pointed work, at a cost.' },
      { label: 'Soften the language',  effect: 'rest',   blurb: 'Take a breath; lose a little ground.' },
      { label: 'Trust their judgement', effect: 'ignore', blurb: 'Stay out of it.' },
    ],
  },
  {
    prompt: '{name} reports the librarian has put a hold on a critical source — it\'s being copied for the Crown. Wait, push without it, or send for a tradesman to retrieve it overnight?',
    options: [
      { label: 'Push without it', effect: 'push',   blurb: 'Move on; the gap may show.' },
      { label: 'Wait and rest',   effect: 'rest',   blurb: 'Lose a day; preserve quality.' },
      { label: 'Let them decide', effect: 'ignore', blurb: 'They\'ll manage one way or the other.' },
    ],
  },
  {
    prompt: 'A wealthy patron offers {name} a private commission on the side. {name} asks whether to take it; the focus might wander.',
    options: [
      { label: 'Take it — sharpen focus', effect: 'push', blurb: 'Pressure can clarify. Wellbeing pays.' },
      { label: 'Decline; stay the course', effect: 'rest', blurb: 'Steady work. A modest slowdown today.' },
      { label: 'Let them decide',         effect: 'ignore', blurb: 'Stay out of it.' },
    ],
  },
  {
    prompt: '{name} is at an impasse over a difficult passage. They ask whether to write through it or read for inspiration.',
    options: [
      { label: 'Write through',  effect: 'push', blurb: 'Force the words. Quality risks.' },
      { label: 'Read for a day', effect: 'rest', blurb: 'Lose a day; gain a steadier hand.' },
      { label: 'Trust them',     effect: 'ignore', blurb: 'They\'ll find their way.' },
    ],
  },
  {
    prompt: 'A junior copyist asks {name} to mentor them this week. {name} could welcome the company — or shoo them away and keep momentum.',
    options: [
      { label: 'Send them away',       effect: 'push', blurb: 'Stay on pace. A small social cost.' },
      { label: 'Welcome them in',      effect: 'rest', blurb: 'A gentler week; relations warm.' },
      { label: 'Let {name} decide',    effect: 'ignore', blurb: 'Their call.' },
    ],
  },
];

export function pickFlavor(lines: string[], scholarName: string): string {
  const line = lines[Math.floor(Math.random() * lines.length)];
  return line.replace(/\{name\}/g, scholarName);
}

export function pickChoiceEvent(scholarName: string): MidEventChoiceDef {
  const ev = MID_CHOICE_EVENTS[Math.floor(Math.random() * MID_CHOICE_EVENTS.length)];
  return {
    prompt: ev.prompt.replace(/\{name\}/g, scholarName),
    options: ev.options,
  };
}
