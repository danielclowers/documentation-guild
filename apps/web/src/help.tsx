import { useId, useState } from 'react';
import type { ReactNode } from 'react';

export function HelpTip({ topic, children }: { topic: string; children: ReactNode }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <span
      className="help-tip"
      onKeyDown={(event) => {
        if (event.key === 'Escape') setOpen(false);
      }}
    >
      <button
        type="button"
        aria-label={`Help with ${topic}`}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        ?
      </button>
      <span id={id} className="help-bubble" hidden={!open}>
        {children}
      </span>
    </span>
  );
}

const questions = [
  [
    'Where do discoveries and expedition reports go?',
    'Open Journal & Chronicle for personal discoveries, mystery clues and the guild story. The Expedition Board keeps your party reports. Guild activity shows shared discoveries, expedition returns and renown milestones.',
  ],
  [
    'How do cooperative expeditions work?',
    'Open the Expedition Board and create or join a party of two to four members. Start as leader or schedule a departure. An underfilled scheduled party has one 15-minute extension. The expedition continues if everyone closes the game. Your standing order pauses during the expedition and resumes when you’re connected again. Optional personal challenges stay open until 24 hours after the expedition ends.',
  ],
  [
    'How do I earn while idling?',
    'In your character panel, choose Scribing, Research, or Restoration under Standing order and click Start order. Every five minutes connected to the hall earns character XP, XP for the selected skill, and gold. Leave the game open and your character will keep working while you idle.',
  ],
  [
    'What happens when I close the game?',
    'Closing your last connected tab pauses standing orders. If you leave with three minutes until the next payout, you still have three minutes left when you return. Your earned rewards and unfinished cycle carry over. Extra tabs share the same timer.',
  ],
  [
    'Does changing hall stations change my standing order?',
    'Hall station moves your avatar. To change your assignment or the skill that earns XP, use Standing order in your character panel. Each assignment keeps its own unfinished cycle.',
  ],
  [
    'Do Guild Business cases run out?',
    'The board holds three solo cases and refills as you finish them. It cycles through twelve templates. The first eight payouts in a rolling 24-hour window pay full rewards. Additional cases pay 5 character XP and 2 gold.',
  ],
  [
    'How do I use gold?',
    'Training opens at character level 3. Each upgrade has three ranks. Your first specialization is free at level 10. Switching later costs 200 gold and starts a 24-hour cooldown.',
  ],
  [
    'How does a coworker join?',
    'A guild admin creates a one-use invitation under Guild administration. The recipient opens it, creates a username, password and character, then signs in.',
  ],
] as const;

export function HelpPage() {
  return (
    <main className="help-page" aria-labelledby="help-title">
      <a href="#/">← Back to the guild</a>
      <h1 id="help-title" tabIndex={-1}>
        Help &amp; FAQ
      </h1>
      {questions.map(([question, answer]) => (
        <details key={question}>
          <summary>{question}</summary>
          <p>{answer}</p>
        </details>
      ))}
    </main>
  );
}
