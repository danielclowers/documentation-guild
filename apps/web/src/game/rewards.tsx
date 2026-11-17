import type { BusinessPayout, BusinessReward, DiscoveryFind, Skill } from '@guild/shared';
import { GameIcon } from './icons';

export function Rarity({ value }: { value: string }) {
  return (
    <span className="discovery-rarity" data-rarity={value}>
      {value}
    </span>
  );
}

export function DiscoveryNotice({
  item,
  onJournal,
}: {
  item: DiscoveryFind;
  onJournal: (key: string) => void;
}) {
  return (
    <aside
      className="discovery-notice"
      data-rarity={item.rarity}
      aria-label={item.known ? 'Known discovery' : 'New discovery'}
    >
      <div className="help-heading">
        <GameIcon name="spark" />
        <strong>{item.known ? 'Already in your journal' : 'New discovery!'}</strong>
        <Rarity value={item.rarity} />
      </div>
      <p>
        <strong>{item.title}</strong>
      </p>
      <p>{item.text}</p>
      {!item.known && <p>Added to your journal.</p>}
      <button type="button" onClick={() => onJournal(item.key)}>
        Read journal entry
      </button>
    </aside>
  );
}

export function RewardChips({ payout, skill }: { payout: BusinessPayout; skill: Skill }) {
  return (
    <span className="reward-chips" aria-label="Itemized rewards" role="list">
      <span role="listitem">
        <GameIcon name="spark" />
        {payout.xp} character XP
      </span>
      {payout.skillXp > 0 && (
        <span role="listitem">
          <GameIcon name="training" />
          {payout.skillXp} {skill} XP
        </span>
      )}
      <span role="listitem">
        <GameIcon name="coin" />
        {payout.gold} gold
      </span>
      {payout.renown > 0 && (
        <span role="listitem">
          <GameIcon name="people" />
          {payout.renown} guild renown
        </span>
      )}
    </span>
  );
}

export function CaseComplete({
  reward,
  onJournal,
}: {
  reward: BusinessReward;
  onJournal: (key: string) => void;
}) {
  return (
    <section className="case-complete" aria-label="Case complete">
      <div role="status">
        <h3>
          <span aria-hidden="true">✓</span> Case complete!
        </h3>
        <p>{reward.outcome}</p>
        {!reward.full && <p>Reduced rewards: no skill XP, renown or discovery roll.</p>}
        <RewardChips payout={reward} skill={reward.skill} />
      </div>
      {reward.discovery && <DiscoveryNotice item={reward.discovery} onJournal={onJournal} />}
    </section>
  );
}
