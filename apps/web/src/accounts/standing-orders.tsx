import { skillSchema, standingOrders } from '@guild/shared';
import type { GuildProfile, Skill } from '@guild/shared';
import { useState } from 'react';
import { accountError, type AccountApi } from './api';

export function StandingOrders({
  character,
  request,
  onChange,
}: {
  character: NonNullable<GuildProfile['character']>;
  request: AccountApi;
  onChange: (profile: GuildProfile) => void;
}) {
  const { order, skills, latestReward } = character.progression;
  const [choice, setChoice] = useState<Skill | ''>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const selection = choice || order?.skill || '';
  const rate = selection ? standingOrders[selection] : null;

  async function save() {
    if (!selection) return;
    setBusy(true);
    setError('');
    try {
      const next = await request<GuildProfile>('/me/standing-order', {
        method: 'PUT',
        body: JSON.stringify({ skill: selection }),
      });
      onChange(next);
      setChoice('');
    } catch (err) {
      setError(accountError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="standing-orders" aria-labelledby="standing-order-title">
      <h3 id="standing-order-title">Standing order</h3>
      <p>
        {order
          ? `Working on ${order.skill}`
          : 'Choose a task for your character to work on automatically.'}
      </p>
      <label htmlFor="order-skill">Assignment</label>
      <select
        id="order-skill"
        disabled={busy}
        value={selection}
        onChange={(event) => {
          const result = skillSchema.safeParse(event.currentTarget.value);
          setChoice(result.success ? result.data : '');
        }}
      >
        <option value="" disabled>
          Choose an assignment
        </option>
        {skillSchema.options.map((skill) => (
          <option key={skill}>{skill}</option>
        ))}
      </select>
      {rate && (
        <p>
          Every 5 minutes, earn {rate.xp} XP, {rate.skillXp} skill XP, and {rate.gold} gold.
        </p>
      )}
      <button
        type="button"
        disabled={!selection || selection === order?.skill || busy}
        onClick={() => void save()}
      >
        {order ? 'Change order' : 'Start order'}
      </button>
      {error && <p role="alert">{error}</p>}
      {selection === 'Scribing' && character.progression.specialization === 'Chronicler' && (
        <p>Chronicler adds 10% gold, rounded down per payout.</p>
      )}
      {order?.nextRewardAt != null && (
        <p>
          Next payout around{' '}
          {new Date(order.nextRewardAt).toLocaleTimeString([], {
            hour: 'numeric',
            minute: '2-digit',
          })}
        </p>
      )}
      {latestReward && (
        <p>
          Last payout · {latestReward.skill}: +{latestReward.xp} XP, +{latestReward.skillXp} skill
          XP, +{latestReward.gold} gold
        </p>
      )}
      <p>Earn up to 24 hours while away.</p>
      <h3>Skills</h3>
      <ul>
        {skillSchema.options.map((skill) => (
          <li key={skill}>
            {skill} · Lv {skills[skill].level} · {skills[skill].xp} XP
          </li>
        ))}
      </ul>
    </section>
  );
}
