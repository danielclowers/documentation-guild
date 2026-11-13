import type {
  BusinessAnswer,
  BusinessCase,
  BusinessChoiceKind,
  BusinessReward,
  BusinessSubmission,
  GuildProfile,
} from '@guild/shared';
import { useCallback, useEffect, useState } from 'react';
import { HelpTip } from '../help';
import { accountError, type AccountApi } from './api';

const choiceLabels: Record<BusinessChoiceKind, string> = {
  guaranteed_gold: '+4 gold on a full payout',
  discovery_roll: 'Higher discovery chance',
  renown_bonus: '+5 guild renown on a full payout',
};

function CaseForm({
  item,
  busy,
  onSubmit,
}: {
  item: BusinessCase;
  busy: boolean;
  onSubmit: (answer: BusinessAnswer) => void;
}) {
  const [sequence, setSequence] = useState(() => (item.type === 'sequence' ? item.tiles : []));
  const [option, setOption] = useState<number>();
  const [pairs, setPairs] = useState<[number, number][]>([]);
  const [first, setFirst] = useState<number>();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!item.retryAt) return;
    const timer = window.setTimeout(
      () => setNow(Date.now()),
      Math.max(0, item.retryAt - Date.now() + 50),
    );
    return () => window.clearTimeout(timer);
  }, [item.retryAt]);

  function move(index: number, direction: number) {
    const next = [...sequence];
    const destination = index + direction;
    [next[index], next[destination]] = [next[destination]!, next[index]!];
    setSequence(next);
  }

  function selectTile(index: number) {
    if (index === first) setFirst(undefined);
    else if (first === undefined) setFirst(index);
    else {
      setPairs([...pairs, [first, index]]);
      setFirst(undefined);
    }
  }

  const locked = busy || now < item.retryAt;
  return (
    <form
      className="business-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (locked) return;
        if (item.type === 'sequence') onSubmit({ type: 'sequence', tiles: sequence });
        else if (item.type === 'matching' && pairs.length === 3)
          onSubmit({ type: 'matching', pairs });
        else if ((item.type === 'choice' || item.type === 'deduction') && option !== undefined)
          onSubmit({ type: item.type, option });
      }}
    >
      <h4>{item.title}</h4>
      <p>{item.prompt}</p>
      {item.type === 'sequence' && (
        <ol className="business-sequence">
          {sequence.map((tile, index) => (
            <li key={tile}>
              <strong>{tile}</strong>
              <button
                type="button"
                disabled={index === 0}
                aria-label={`Move ${tile} earlier`}
                onClick={() => move(index, -1)}
              >
                Earlier
              </button>
              <button
                type="button"
                disabled={index === sequence.length - 1}
                aria-label={`Move ${tile} later`}
                onClick={() => move(index, 1)}
              >
                Later
              </button>
            </li>
          ))}
        </ol>
      )}
      {item.type === 'matching' && (
        <>
          <div className="business-tiles">
            {item.tiles.map((tile, index) => {
              const pairIndex = pairs.findIndex((pair) => pair.includes(index));
              return (
                <button
                  key={index}
                  type="button"
                  aria-pressed={first === index}
                  disabled={pairIndex >= 0}
                  onClick={() => selectTile(index)}
                >
                  {tile}
                  {pairIndex >= 0 && ` · pair ${pairIndex + 1}`}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => {
              setPairs([]);
              setFirst(undefined);
            }}
          >
            Reset pairs
          </button>
        </>
      )}
      {(item.type === 'deduction' || item.type === 'choice') && (
        <fieldset>
          <legend>Your answer</legend>
          {item.options.map((entry) => (
            <label key={entry.id}>
              <input
                type="radio"
                name="business-option"
                checked={option === entry.id}
                onChange={() => setOption(entry.id)}
              />
              <span>
                {entry.label}
                {entry.effect && <small>{choiceLabels[entry.effect]}</small>}
              </span>
            </label>
          ))}
        </fieldset>
      )}
      {item.attempts > 0 && (
        <p role="status">
          {locked ? 'Take another look before retrying.' : 'That answer didn’t fit. Try again.'}
        </p>
      )}
      <button
        type="submit"
        disabled={
          locked ||
          (item.type === 'matching' && pairs.length !== 3) ||
          ((item.type === 'deduction' || item.type === 'choice') && option === undefined)
        }
      >
        Submit answer
      </button>
    </form>
  );
}

export function GuildBusiness({
  request,
  onChange,
}: {
  request: AccountApi;
  onChange: (profile: GuildProfile) => void;
}) {
  const [open, setOpen] = useState(false);
  const [cases, setCases] = useState<BusinessCase[]>();
  const [selected, setSelected] = useState<string>();
  const [reward, setReward] = useState<BusinessReward>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const active = cases?.find((item) => item.id === selected);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const board = await request<{ cases: BusinessCase[] }>('/business', { signal });
        if (!signal?.aborted) setCases(board.cases);
      } catch (err) {
        if (!signal?.aborted) setError(accountError(err));
      }
    },
    [request],
  );

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [open, load]);

  async function submit(answer: BusinessAnswer) {
    if (!active || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await request<BusinessSubmission>(`/business/${active.id}/submit`, {
        method: 'POST',
        body: JSON.stringify(answer),
      });
      if (result.status === 'retry') {
        setCases((items) =>
          items?.map((item) =>
            item.id === active.id
              ? { ...item, attempts: result.attempts, retryAt: result.retryAt }
              : item,
          ),
        );
      } else {
        setReward(result.reward);
        setSelected(undefined);
        setCases((items) => items?.filter(({ id }) => id !== active.id));
        await Promise.all([load(), request<GuildProfile>('/me').then(onChange)]);
      }
    } catch (err) {
      setError(accountError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <details
      className="guild-admin business"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>Guild Business</summary>
      <div className="help-heading">
        <span>Personal cases</span>
        <HelpTip topic="Guild Business">
          Cases refill as you finish them. The first eight payouts in a rolling 24-hour window pay
          full rewards.
        </HelpTip>
      </div>
      {reward && (
        <div className="business-reward" role="status">
          Case complete · +{reward.xp} XP · +{reward.gold} gold
          {reward.skillXp > 0 && ` · +${reward.skillXp} skill XP`}
          {reward.renown > 0 && ` · +${reward.renown} guild renown`}
          {reward.discovery && (
            <p>
              <strong>{reward.discovery.title}</strong> · {reward.discovery.text}
            </p>
          )}
        </div>
      )}
      {error && (
        <p role="alert">
          {error}{' '}
          <button
            type="button"
            onClick={() => {
              setError('');
              void load();
            }}
          >
            Refresh cases
          </button>
        </p>
      )}
      {active ? (
        <>
          <button type="button" disabled={busy} onClick={() => setSelected(undefined)}>
            Back to cases
          </button>
          <CaseForm
            key={active.id}
            item={active}
            busy={busy}
            onSubmit={(answer) => void submit(answer)}
          />
        </>
      ) : cases ? (
        <ul className="business-list">
          {cases.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setReward(undefined);
                  setSelected(item.id);
                }}
              >
                {item.title}
              </button>
              <small>
                {item.skill} · {item.difficulty === 'advanced' ? 'Advanced' : 'Standard'}
              </small>
            </li>
          ))}
        </ul>
      ) : (
        !error && <p role="status">Loading cases…</p>
      )}
    </details>
  );
}
