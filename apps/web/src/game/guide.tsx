import type { MenuId } from './menu';

export const guideSteps: { title: string; text: string; menu?: MenuId; action?: string }[] = [
  {
    title: 'Welcome to the guild',
    text: 'This hall is shared with your guild. Click a nameplate or the online count to see who is here.',
  },
  {
    title: 'Find your way around',
    text: 'Your character walks to the station you pick in Settings or when you start a standing order. You can use every menu from the dock.',
  },
  {
    title: 'Choose a standing order',
    text: 'Pick Scribing, Research, or Restoration. Every five connected minutes earns XP and gold. Closing the game saves your place in the cycle.',
    menu: 'orders',
    action: 'Choose an assignment',
  },
  {
    title: 'Solve your first case',
    text: 'Guild Business is solo. Try the introductory manuscript. Eight full payouts fit in a rolling 24 hours, and you can keep playing for reduced rewards.',
    menu: 'business',
    action: 'Open Guild Business',
  },
  {
    title: 'Travel with the guild',
    text: 'Two to four players can depart together. The expedition finishes even if you disconnect. Optional challenges earn extra rewards.',
    menu: 'expeditions',
    action: 'See expeditions',
  },
  {
    title: 'Grow your character',
    text: 'Character XP raises your level. Skill XP raises one skill and helps on matching expedition challenges. Spend gold on training at level 3. Specializations open at level 10.',
    menu: 'character',
    action: 'See your skills',
  },
  {
    title: 'Keep what you find',
    text: 'Discoveries stay in your journal. The guild uncovers shared Chronicle clues on expeditions, and everyone can read the unfolding story.',
    menu: 'journal',
    action: 'Open the journal',
  },
];

export function GuildGuide({
  index,
  inMenu,
  order,
  solved,
  onMove,
  onOpen,
  onEnd,
}: {
  index: number;
  inMenu: boolean;
  order: boolean;
  solved: boolean;
  onMove: (index: number) => void;
  onOpen: (menu: MenuId) => void;
  onEnd: () => void;
}) {
  const step = guideSteps[index]!;
  const last = index === guideSteps.length - 1;
  return (
    <section className="guild-guide" data-in-menu={inMenu} aria-labelledby="guide-title">
      <small>
        Guild tour · {index + 1}/{guideSteps.length}
      </small>
      <h3 id="guide-title">{step.title}</h3>
      <p>{step.text}</p>
      {index === 2 && order && <p className="guide-check">✓ Standing order selected</p>}
      {index === 3 && solved && <p className="guide-check">✓ Case completed</p>}
      <div className="game-actions">
        {step.menu && step.action && !inMenu && (
          <button type="button" onClick={() => onOpen(step.menu!)}>
            {step.action}
          </button>
        )}
        <button type="button" disabled={index === 0} onClick={() => onMove(index - 1)}>
          Back
        </button>
        <button type="button" onClick={() => (last ? onEnd() : onMove(index + 1))}>
          {last ? 'Finish tour' : 'Next'}
        </button>
        {!last && (
          <button type="button" className="guide-skip" onClick={onEnd}>
            Skip tour
          </button>
        )}
      </div>
    </section>
  );
}
