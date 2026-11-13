import { skillSchema, standingOrders } from '@guild/shared';
import type { GuildProfile, Skill } from '@guild/shared';
import { useEffect, useState } from 'react';
import { HelpTip } from '../help';
import { accountError, type AccountApi } from './api';

export function StandingOrders({
  character,
  request,
  onChange,
  hallConnected,
}: {
  character: NonNullable<GuildProfile['character']>;
  request: AccountApi;
  onChange: (profile: GuildProfile) => void;
  hallConnected: boolean;
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
      <div className="help-heading">
        <h3 id="standing-order-title">Standing order</h3>
        <HelpTip topic="Standing orders">
          Choose an assignment and leave the hall open. Closing your last connected tab pauses the
          cycle. You pick up where you left off when you return.
        </HelpTip>
      </div>
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
      {order && <PayoutTimer key={order.skill} order={order} hallConnected={hallConnected} />}
      {latestReward && (
        <p>
          Last payout · {latestReward.skill}: +{latestReward.xp} XP, +{latestReward.skillXp} skill
          XP, +{latestReward.gold} gold
        </p>
      )}
      <p>Earn while connected to the hall, even when idle.</p>
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

function PayoutTimer({
  order,
  hallConnected,
}: {
  order: NonNullable<NonNullable<GuildProfile['character']>['progression']['order']>;
  hallConnected: boolean;
}) {
  const running = order.running && hallConnected;
  const [seconds, setSeconds] = useState(() => Math.ceil(order.remainingMs / 1000));
  useEffect(() => {
    if (order.running && !hallConnected) return;
    const receivedAt = performance.now();
    const tick = () => {
      const elapsed = running ? performance.now() - receivedAt : 0;
      setSeconds(Math.max(0, Math.ceil((order.remainingMs - elapsed) / 1000)));
    };
    tick();
    if (!running) return;
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [order, running, hallConnected]);
  const duration = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  return (
    <p className="order-timer">
      {running
        ? seconds > 0
          ? `Next payout in ${duration}`
          : 'Confirming payout…'
        : `Paused · ${duration} remaining`}
    </p>
  );
}
