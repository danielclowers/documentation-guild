import {
  specializationKeys,
  specializationLevel,
  specializations,
  specializationSwitchCost,
  trainingCosts,
  trainingKeys,
  trainingLevel,
  trainingUpgrades,
} from '@guild/shared';
import type { GuildProfile, Specialization, TrainingKey } from '@guild/shared';
import { useState } from 'react';
import { HelpTip } from '../help';
import { accountError, type AccountApi } from './api';

export function Training({
  character,
  request,
  onChange,
}: {
  character: NonNullable<GuildProfile['character']>;
  request: AccountApi;
  onChange: (profile: GuildProfile) => void;
}) {
  const { training, specialization, canSwitchAt } = character.progression;
  const [choice, setChoice] = useState<Specialization | ''>('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const selected = choice || specialization || '';
  const locked = canSwitchAt !== null && canSwitchAt > Date.now();
  const cost = specialization ? specializationSwitchCost : 0;

  async function update(path: string, body: object, success: string) {
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const next = await request<GuildProfile>(path, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      onChange(next);
      setChoice('');
      setMessage(success);
    } catch (err) {
      setError(accountError(err));
    } finally {
      setBusy(false);
    }
  }

  function buy(key: TrainingKey, rank: number) {
    void update(
      `/me/training/${key}`,
      { expectedRank: rank },
      `${trainingUpgrades[key].label} reached rank ${rank + 1}.`,
    );
  }

  return (
    <details className="guild-admin training">
      <summary>Training &amp; specialization</summary>
      <div className="help-heading">
        <h3>Training</h3>
        <HelpTip topic="Training">
          Spend gold to buy up to three permanent ranks per upgrade. Training stays with you if you
          change specialization.
        </HelpTip>
      </div>
      {character.level < trainingLevel && <p>Unlocks at level {trainingLevel}.</p>}
      <ul>
        {trainingKeys.map((key) => {
          const rank = training[key] ?? 0;
          const price = trainingCosts[rank];
          const upgrade = trainingUpgrades[key];
          return (
            <li key={key}>
              <strong>
                {upgrade.label} · {rank}/{trainingCosts.length}
              </strong>
              <p>{upgrade.description}</p>
              {price !== undefined && (
                <button
                  type="button"
                  disabled={busy || character.level < trainingLevel || character.gold < price}
                  onClick={() => buy(key, rank)}
                >
                  Train for {price} gold
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <h3>Specialization</h3>
      {character.level < specializationLevel && <p>Unlocks at level {specializationLevel}.</p>}
      {specialization && <p>Active · {specialization}</p>}
      <label htmlFor="specialization-choice">Primary specialization</label>
      <select
        id="specialization-choice"
        value={selected}
        disabled={busy || character.level < specializationLevel}
        onChange={(event) =>
          setChoice(specializationKeys.find((key) => key === event.currentTarget.value) ?? '')
        }
      >
        <option value="" disabled>
          Choose a specialization
        </option>
        {specializationKeys.map((key) => (
          <option key={key}>{key}</option>
        ))}
      </select>
      {selected && (
        <p>
          {specializations[selected].skill} · {specializations[selected].description}
        </p>
      )}
      {locked && <p>Switching available {new Date(canSwitchAt).toLocaleString()}.</p>}
      <button
        type="button"
        disabled={
          !selected ||
          selected === specialization ||
          busy ||
          locked ||
          character.level < specializationLevel ||
          character.gold < cost
        }
        onClick={() =>
          void update(
            '/me/specialization',
            { specialization: selected, expected: specialization },
            `Specialization set to ${selected}.`,
          )
        }
      >
        {specialization ? `Switch for ${cost} gold` : 'Choose specialization for free'}
      </button>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
