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

export const discoveryHelp = [
  'Guild Business discoveries roll on full rewards. Standard and introductory cases start at 8%, advanced cases at 12%. A discovery choice adds 12 percentage points. Careful Research training adds 2 points per rank on Research cases.',
  'A successful expedition discovery choice starts at 12%. The Research role and curious strategy each add 5 points. On Research events, Archivist adds 8 points and Missing References adds 5 points. The roll is capped at 30%. When three players resolve optional challenges, the party gets one 15% shared roll.',
  'Rarity belongs to each entry. Finds are drawn from the optional catalog without weighting by rarity. An already-known entry can come up again and does not reroll or create another journal entry.',
  'Some discoveries link into mysteries. The Chronicle records guaranteed guild clues from expedition milestones. Finding an optional entry with the same name does not advance that objective. Discoveries tell stories and have no passive stat or reward bonus.',
] as const;

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
    'The board holds three solo cases and refills as you finish them. Each of your eight full payouts frees its slot 24 hours later. Extra cases pay 5 character XP and 2 gold, with no skill XP, renown, or discovery roll.',
  ],
  [
    'What do XP and guild renown do?',
    'Character XP raises your overall level and unlocks training and specializations. Skill XP raises Scribing, Research, or Restoration and helps on matching expedition checks. Guild renown is shared. Expeditions earn chapter renown and advance the Chronicle.',
  ],
  [
    'Can I replay the guild tour?',
    'Open Settings & Help in the hall and choose Replay guild tour. You can skip any time and keep playing while you explore.',
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

export function FAQ() {
  return (
    <div className="faq">
      {questions.map(([question, answer]) => (
        <details key={question}>
          <summary>{question}</summary>
          <p>{answer}</p>
        </details>
      ))}
      <details>
        <summary>How do discovery rolls work?</summary>
        {discoveryHelp.map((item) => (
          <p key={item}>{item}</p>
        ))}
      </details>
    </div>
  );
}

export function HelpPage() {
  return (
    <main className="help-page" aria-labelledby="help-title">
      <a href="#/">← Back to the guild</a>
      <h1 id="help-title" tabIndex={-1}>
        Help &amp; FAQ
      </h1>
      <FAQ />
    </main>
  );
}
