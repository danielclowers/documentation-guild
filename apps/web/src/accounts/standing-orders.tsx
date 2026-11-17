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
  suggested,
}: {
  character: NonNullable<GuildProfile['character']>;
  request: AccountApi;
  onChange: (profile: GuildProfile) => void;
  hallConnected: boolean;
  suggested?: Skill;
}) {
  const { order, latestReward } = character.progression;
  const [choice, setChoice] = useState<Skill | ''>(suggested ?? '');
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
          five-minute cycle. When you return, you pick up where you left off.
        </HelpTip>
      </div>
      <p>
        {order
          ? `Working on ${order.skill}`
          : "Choose what your character should work on while you're connected."}
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
          Every 5 connected minutes: {rate.xp} character XP, {rate.skillXp} skill XP, and{' '}
          {rate.gold} gold.
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
      {character.progression.onExpedition && <p>Standing order paused during your expedition.</p>}
      {order && <PayoutTimer key={order.skill} order={order} hallConnected={hallConnected} />}
      {latestReward && (
        <p>
          Last payout · {latestReward.skill}: +{latestReward.xp} XP, +{latestReward.skillXp} skill
          XP, +{latestReward.gold} gold
        </p>
      )}
      <p>You earn rewards while connected even if you're working in another app.</p>
    </section>
  );
}

export function PayoutTimer({
  order,
  hallConnected,
  compact = false,
}: {
  order: NonNullable<NonNullable<GuildProfile['character']>['progression']['order']>;
  hallConnected: boolean;
  compact?: boolean;
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
    <span className="order-timer">
      {running
        ? seconds > 0
          ? compact
            ? duration
            : `Next payout in ${duration}`
          : 'Confirming payout…'
        : compact
          ? `Paused · ${duration}`
          : `Paused · ${duration} remaining`}
    </span>
  );
}
