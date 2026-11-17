import type {
  BusinessAnswer,
  BusinessAllowance,
  BusinessBoard,
  BusinessPreview,
  BusinessCase,
  BusinessChoiceKind,
  BusinessReward,
  BusinessSubmission,
  GuildProfile,
} from '@guild/shared';
import { useCallback, useEffect, useState } from 'react';
import { HelpTip } from '../help';
import { CaseComplete, RewardChips } from '../game/rewards';
import { accountError, type AccountApi } from './api';

const choiceLabels: Record<BusinessChoiceKind, string> = {
  guaranteed_gold: 'Gold you can spend on training or changing specialization.',
  discovery_roll: 'Increases your chances of finding an entry for your journal.',
  renown_bonus:
    "Increases the guild's shared renown. Chronicle objectives still require expeditions.",
};

const difficulties = { intro: 'Introductory', normal: 'Standard', advanced: 'Advanced' };

function DiscoveryOdds({ preview }: { preview: BusinessPreview }) {
  if (!preview.discoveryChance) return null;
  return (
    <small>
      {preview.discoveryChance}% chance of a discovery
      {preview.newDiscoveryChance < preview.discoveryChance &&
        (preview.newDiscoveryChance > 0
          ? ` · about ${preview.newDiscoveryChance.toFixed(1)}% chance of a new journal entry`
          : " · You've found every entry in this discovery pool.")}
    </small>
  );
}

function RewardPreview({ item }: { item: BusinessCase }) {
  const preview = item.preview;
  if (!preview) return null;
  const choices = Object.values(item.choicePreviews ?? {});
  const highestChance = Math.max(
    preview.discoveryChance,
    ...choices.map((result) => result.discoveryChance),
  );
  const extraGold = Math.max(0, ...choices.map((result) => result.gold - preview.gold));
  const renown = Math.max(0, ...choices.map((result) => result.renown));
  return (
    <div className="case-preview">
      <RewardChips payout={preview} skill={item.skill} />
      {preview.full && (
        <>
          <DiscoveryOdds preview={preview} />
          {choices.length > 0 && (
            <small>
              Choose one bonus: +{extraGold} gold, +{renown} guild renown
              {preview.newDiscoveryChance > 0
                ? `, or a ${highestChance}% discovery roll.`
                : ', or a chance to revisit a known discovery.'}
            </small>
          )}
        </>
      )}
      {preview.retryPenalty && (
        <small>
          After three incorrect attempts, this case awards 75% of its usual XP, skill XP and gold,
          rounded down.
        </small>
      )}
    </div>
  );
}

function Allowance({ value }: { value: BusinessAllowance }) {
  return (
    <section className="business-allowance" aria-label="Full-reward allowance">
      <div>
        <strong>
          {value.remaining}/{value.limit} full-reward cases remaining
        </strong>
        <span>{value.remaining ? 'Full rewards' : 'Reduced rewards'}</span>
      </div>
      <meter
        min={0}
        max={value.limit}
        value={value.remaining}
        aria-label="Full case rewards remaining"
      />
      <p>
        {value.remaining
          ? 'Each full-reward completion restores one slot 24 hours later.'
          : 'You can still earn 5 character XP and 2 gold per case. Skill XP, renown and discovery rolls are only available with full rewards.'}
      </p>
      {value.nextAt && (
        <small>
          Next full-reward slot:{' '}
          <time dateTime={new Date(value.nextAt).toISOString()}>
            {new Date(value.nextAt).toLocaleString([], {
              weekday: 'short',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </time>
          .
        </small>
      )}
    </section>
  );
}

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
  const routine = item.type === 'choice' && item.preview?.full === false;
  return (
    <form
      className="business-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (locked) return;
        if (item.type === 'sequence') onSubmit({ type: 'sequence', tiles: sequence });
        else if (item.type === 'matching' && pairs.length === 3)
          onSubmit({ type: 'matching', pairs });
        else if (routine && item.type === 'choice' && item.options[0])
          onSubmit({ type: 'choice', option: item.options[0].id });
        else if ((item.type === 'choice' || item.type === 'deduction') && option !== undefined)
          onSubmit({ type: item.type, option });
      }}
    >
      <h4>{item.title}</h4>
      <small>
        {difficulties[item.difficulty]} · {item.skill}
      </small>
      <p>{item.prompt}</p>
      {item.clues && (
        <ul className="business-clues">
          {item.clues.map((clue) => (
            <li key={clue}>{clue}</li>
          ))}
        </ul>
      )}
      <RewardPreview item={item} />
      {routine && (
        <p>
          This case is eligible for reduced rewards only. File a routine report to receive the
          available reward.
        </p>
      )}
      {item.type === 'sequence' && (
        <ol className="business-sequence">
          {sequence.map((tile, index) => (
            <li key={tile}>
              <strong>{item.labels?.[tile] ?? tile}</strong>
              <button
                type="button"
                disabled={index === 0}
                aria-label={`Move ${item.labels?.[tile] ?? tile} earlier`}
                onClick={() => move(index, -1)}
              >
                Earlier
              </button>
              <button
                type="button"
                disabled={index === sequence.length - 1}
                aria-label={`Move ${item.labels?.[tile] ?? tile} later`}
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
      {!routine && (item.type === 'deduction' || item.type === 'choice') && (
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
                {item.choicePreviews?.[entry.id] && (
                  <>
                    <RewardChips payout={item.choicePreviews[entry.id]!} skill={item.skill} />
                    <DiscoveryOdds preview={item.choicePreviews[entry.id]!} />
                  </>
                )}
              </span>
            </label>
          ))}
        </fieldset>
      )}
      {item.attempts > 0 && (
        <p role="status">
          {now < item.retryAt
            ? 'Take a moment before trying again.'
            : item.type === 'matching' || item.type === 'sequence'
              ? 'Not quite. Check your arrangement and try again.'
              : "That answer doesn't fit the clues. Try again."}
        </p>
      )}
      <button
        type="submit"
        disabled={
          locked ||
          (item.type === 'matching' && pairs.length !== 3) ||
          (!routine &&
            (item.type === 'deduction' || item.type === 'choice') &&
            option === undefined)
        }
      >
        {routine ? 'File report' : 'Submit answer'}
      </button>
    </form>
  );
}

export function GuildBusiness({
  request,
  visible,
  onChange,
  onJournal,
  onComplete,
}: {
  request: AccountApi;
  visible: boolean;
  onChange: (profile: GuildProfile) => void;
  onJournal: (key: string) => void;
  onComplete?: (reward: BusinessReward) => void;
}) {
  const [allowance, setAllowance] = useState<BusinessAllowance>();
  const [cases, setCases] = useState<BusinessCase[]>();
  const [selected, setSelected] = useState<string>();
  const [reward, setReward] = useState<BusinessReward>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const active = cases?.find((item) => item.id === selected);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const board = await request<BusinessBoard>('/business', { signal });
        if (!signal?.aborted) {
          setCases(board.cases);
          setAllowance(board.allowance);
          setError('');
        }
      } catch (err) {
        if (!signal?.aborted) setError(accountError(err));
      }
    },
    [request],
  );

  useEffect(() => {
    if (!visible) return;
    const controller = new AbortController();
    void load(controller.signal);
    const interval = window.setInterval(() => {
      if (!document.hidden) void load(controller.signal);
    }, 30_000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [visible, load]);

  const nextAt = allowance?.nextAt;
  useEffect(() => {
    if (!visible || !nextAt || nextAt <= Date.now()) return;
    const timer = window.setTimeout(() => void load(), nextAt - Date.now() + 250);
    return () => window.clearTimeout(timer);
  }, [visible, nextAt, load]);

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
        await load();
      } else {
        setReward(result.reward);
        onComplete?.(result.reward);
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
    <div className="business panel-content">
      <div className="help-heading">
        <span>Personal cases</span>
        <HelpTip topic="Guild Business">
          Three personal cases are available at a time. Finish a case to receive another. Eight
          full-reward completions are available in a rolling 24-hour window.
        </HelpTip>
      </div>
      {allowance && <Allowance value={allowance} />}
      {reward && <CaseComplete reward={reward} onJournal={onJournal} />}
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
                {item.skill} · {difficulties[item.difficulty]}
              </small>
              <RewardPreview item={item} />
            </li>
          ))}
        </ul>
      ) : (
        !error && <p role="status">Loading cases…</p>
      )}
    </div>
  );
}
