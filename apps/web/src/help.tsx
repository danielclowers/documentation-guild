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
  'Full-reward introductory and standard Guild Business cases have an 8% discovery chance. Advanced cases have a 12% chance. Choosing a discovery bonus adds 12 percentage points. Careful Research adds 2 percentage points per rank on Research cases. Reduced-reward cases have no discovery chance.',
  'A successful expedition choice that offers a discovery starts at 12%. The Research role and the unusual-leads approach each add 5 percentage points. On Research encounters, Archivist adds 8 points and Missing References adds 5 points. The total chance is capped at 30%. If three different participants resolve optional challenges, the party also gets one shared 15% discovery roll.',
  "Discoveries have rarities, but the optional pool does not give different selection weights to different rarities. You might find an entry you already know. That doesn't create a duplicate journal entry or another roll.",
  "Some entries are part of longer mysteries. The Chronicle's required clues arrive through expedition milestones and are shared by the guild. A personal discovery, even one with the same title, does not advance a chapter objective. Journal discoveries reveal information and stories, but they do not grant permanent stat bonuses.",
] as const;

const questions = [
  [
    'Where do discoveries and expedition reports go?',
    'Open Journal & Chronicle for personal discoveries, mysteries and the shared story. The Expedition Board keeps your party reports. Guild Activity shows expedition returns, shared discoveries and renown milestones.',
  ],
  [
    'How do cooperative expeditions work?',
    'Create or join a party of two to four members on the Expedition Board. The leader can start the trip or schedule a departure. A scheduled party with fewer than two members has one extra 15-minute recruitment period. Once a trip starts, it finishes even if everyone closes the game. Your standing order pauses during the trip. Optional challenges remain available for 24 hours after it ends.',
  ],
  [
    'How do I earn while idling?',
    "Open Standing Orders and choose Scribing, Research or Restoration. Start your order and leave the game connected. Every five minutes, you earn character XP, XP for that skill and gold. You don't need to interact with the game to earn these rewards.",
  ],
  [
    'What happens when I close the game?',
    "Closing your last connected tab pauses your standing order. If three minutes were left until your next payout, three minutes will still be left when you return. You keep your earned rewards. Multiple tabs share one timer, so opening more than one doesn't increase earnings. An expedition that has already started will continue normally.",
  ],
  [
    'Does changing hall stations change my standing order?',
    "No. Moving to a station changes your character's location. To change what earns rewards, open Standing Orders and choose a different assignment. Each assignment keeps its own unfinished cycle.",
  ],
  [
    'Do Guild Business cases run out?',
    'No. Three cases are available at a time, and finishing one makes room for another. You can complete eight for full rewards in a rolling 24-hour period. Each full payout restores one slot 24 hours later. Additional cases award 5 character XP and 2 gold, with no skill XP, renown or discovery roll.',
  ],
  [
    'What do XP and guild renown do?',
    "Character XP increases your overall level and unlocks training and specialization. Skill XP increases one of your three skills and helps on matching expedition challenges. Guild renown is shared across all members. Expeditions also earn chapter renown, which counts toward the current Chronicle chapter's goals.",
  ],
  [
    'Can I replay the guild tour?',
    'Yes. Open Settings & Help and choose Replay guild tour. You can skip it at any time and continue playing.',
  ],
  [
    'How do I use gold?',
    'Training opens at level 3. You can buy three ranks of each upgrade. At level 10, you can choose your first specialization for free. Switching later costs 200 gold and starts a 24-hour cooldown.',
  ],
  [
    'How does a coworker join?',
    'A guild admin creates a one-use invitation under Guild Administration and shares the link with the coworker. The coworker follows the link, creates an account and character, then signs in.',
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
