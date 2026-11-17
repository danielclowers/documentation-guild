import type { MenuId } from './menu';

export const guideSteps: { title: string; text: string; menu?: MenuId; action?: string }[] = [
  {
    title: 'Welcome to the guild',
    text: "This is the hall you share with the other guild members. Your character is here whenever you're connected. Click a nameplate or the online count to see who's around.",
  },
  {
    title: 'Find your way around',
    text: "Your character moves automatically. Start an assignment to send them to a workstation, or choose a station in Settings. You can open the guild's menus from the dock.",
  },
  {
    title: 'Choose a standing order',
    text: 'Pick Scribing, Research, or Restoration. Your character earns XP and gold every five minutes while connected. Close the game whenever you need to; your unfinished cycle resumes when you return.',
    menu: 'orders',
    action: 'Choose an assignment',
  },
  {
    title: 'Take on a case',
    text: "Guild Business is work you can do on your own. Start with the apprentice's manuscript. You can earn full rewards for eight cases in a rolling 24-hour period, and complete more cases for reduced rewards.",
    menu: 'business',
    action: 'Open Guild Business',
  },
  {
    title: 'Join an expedition',
    text: 'Expeditions are shared adventures for two to four guild members. Once the party leaves, the trip continues even if you disconnect. Check in for optional challenges if you have time.',
    menu: 'expeditions',
    action: 'See expeditions',
  },
  {
    title: 'Train your character',
    text: 'Character XP increases your overall level. Skill XP improves one of your three skills. At level 3, you can spend gold on training. At level 10, choose a specialization.',
    menu: 'character',
    action: 'See your skills',
  },
  {
    title: 'Keep what you find',
    text: "Your journal records personal discoveries. The guild's expeditions also advance the shared Chronicle. Open the journal to read what you and your guild have found.",
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
