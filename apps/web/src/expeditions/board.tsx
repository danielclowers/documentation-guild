import { expeditionRewards, skillSchema } from '@guild/shared';
import type {
  ExpeditionBoard as Board,
  ExpeditionMission,
  ExpeditionParty,
  GuildProfile,
  Skill,
} from '@guild/shared';
import { useCallback, useEffect, useState } from 'react';
import { accountError, type AccountApi } from '../accounts/api';
import { HelpTip } from '../help';

const stateLabels = {
  recruiting: 'Recruiting',
  grace: '15-minute extension',
  running: 'Underway',
  completed: 'Returned',
  cancelled: 'Cancelled',
  expired: 'Recruitment closed',
  failed: 'Closed by an admin',
};
const delays = [5, 10, 15];
const time = (at: number) =>
  new Date(at).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

function PartyChoices({
  mission,
  onSubmit,
  label,
  busy,
}: {
  mission: ExpeditionMission;
  onSubmit: (role: Skill, approach: string, delay: number | null) => void;
  label: 'Create party' | 'Join party';
  busy: boolean;
}) {
  return (
    <form
      className="expedition-form"
      onSubmit={(event) => {
        event.preventDefault();
        const fields = new FormData(event.currentTarget);
        const role = skillSchema.parse(fields.get('role'));
        const delay = Number(fields.get('delay'));
        onSubmit(role, String(fields.get('approach')), delay || null);
      }}
    >
      <label>
        Role
        <select name="role">
          {skillSchema.options.map((skill) => (
            <option key={skill}>{skill}</option>
          ))}
        </select>
      </label>
      <label>
        Approach
        <select name="approach">
          {mission.approaches.map((approach) => (
            <option value={approach.key} key={approach.key}>
              {approach.label}
            </option>
          ))}
        </select>
      </label>
      {label === 'Create party' && (
        <label>
          Departure
          <select name="delay">
            <option value="0">Manual start</option>
            {delays.map((delay) => (
              <option key={delay} value={delay}>
                In {delay} minutes
              </option>
            ))}
          </select>
        </label>
      )}
      <button disabled={busy}>{label}</button>
    </form>
  );
}

function PartyCard({
  party,
  mission,
  member,
  role,
  busy,
  invitees,
  committed,
  act,
}: {
  party: ExpeditionParty;
  mission: ExpeditionMission;
  member: string;
  role: GuildProfile['role'];
  busy: boolean;
  invitees: Board['invitees'];
  committed: boolean;
  act: (input: object) => void;
}) {
  const [invitee, setInvitee] = useState('');
  const leader = party.leaderId === member;
  const joined = party.roster.some(({ id }) => id === member);
  const recruiting = party.state === 'recruiting' || party.state === 'grace';
  const deadline = party.graceUntil ?? party.scheduledAt;
  const reward = party.report?.reward;
  return (
    <article className="expedition-card">
      <h4>{mission.title}</h4>
      {party.modifier && (
        <p>
          <strong>{party.modifier.title}</strong> · {party.modifier.description}
        </p>
      )}
      <p>
        {stateLabels[party.state]} · {party.roster.length}/4 members
        {party.invited && recruiting && ' · You’re invited'}
      </p>
      {recruiting && deadline !== null && (
        <p>
          {party.state === 'grace' ? 'Extension ends' : 'Scheduled departure'} {time(deadline)}
        </p>
      )}
      {party.state === 'running' && party.endsAt !== null && <p>Returns {time(party.endsAt)}</p>}
      {party.roster.length > 0 && (
        <ul>
          {party.roster.map((item) => (
            <li key={item.id}>
              {item.name} · {item.role} ·{' '}
              {mission.approaches.find(({ key }) => key === item.approach)?.label}
              {item.id === party.leaderId && ' · Leader'}
            </li>
          ))}
        </ul>
      )}
      {party.report && <p>{party.report.text}</p>}
      {reward && (
        <p>
          Your baseline reward · {reward.xp} XP · {reward.skillXp} role XP · {reward.gold} gold
        </p>
      )}
      {party.state === 'completed' && party.report && (
        <p>
          Party earned {party.report.sharedRenown} guild renown.
          {party.report.discovery && ' Shared discovery: ' + party.report.discovery + '.'}
        </p>
      )}
      {recruiting && !joined && !committed && party.roster.length < 4 && (
        <PartyChoices
          mission={mission}
          busy={busy}
          label="Join party"
          onSubmit={(role, approach) => act({ action: 'join', role, approach })}
        />
      )}
      {recruiting && leader && (
        <>
          {deadline === null && (
            <button
              type="button"
              disabled={busy || party.roster.length < 2}
              onClick={() => act({ action: 'start' })}
            >
              Depart now
            </button>
          )}
          {deadline === null && party.roster.length < 2 && (
            <p>At least two members are needed to depart.</p>
          )}
          {party.state === 'recruiting' && party.scheduledAt !== null && (
            <label>
              Reschedule
              <select
                value=""
                disabled={busy}
                onChange={(event) =>
                  act({ action: 'reschedule', delay: Number(event.currentTarget.value) })
                }
              >
                <option value="" disabled>
                  Select a new time
                </option>
                {delays.map((delay) => (
                  <option value={delay} key={delay}>
                    In {delay} minutes
                  </option>
                ))}
              </select>
            </label>
          )}
          {invitees.some((item) => !party.roster.some(({ id }) => id === item.id)) && (
            <label>
              Invite a member
              <select
                value={invitee}
                disabled={busy}
                onChange={(event) => setInvitee(event.currentTarget.value)}
              >
                <option value="">Choose a member</option>
                {invitees
                  .filter((item) => !party.roster.some(({ id }) => id === item.id))
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
          {invitee && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                act({ action: 'invite', memberId: invitee });
                setInvitee('');
              }}
            >
              Send invitation
            </button>
          )}
          <button type="button" disabled={busy} onClick={() => act({ action: 'cancel' })}>
            Cancel party
          </button>
        </>
      )}
      {recruiting && joined && !leader && (
        <>
          <button type="button" disabled={busy} onClick={() => act({ action: 'leave' })}>
            Leave party
          </button>
          {deadline === null && (
            <button type="button" disabled={busy} onClick={() => act({ action: 'transfer' })}>
              Claim leadership after leader absence
            </button>
          )}
        </>
      )}
      {party.state === 'running' && role === 'admin' && (
        <details>
          <summary>Resolve an expedition error</summary>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (window.confirm('End this expedition early and release the party?'))
                act({ action: 'fail' });
            }}
          >
            End expedition early
          </button>
        </details>
      )}
      {party.events.map((event) => (
        <section className="expedition-event" key={event.slot}>
          <h5>{event.title}</h5>
          <p>{event.context}</p>
          {event.result && (
            <p>
              {event.result.text}
              {event.result.success && ` +${event.result.xp} XP · +${event.result.gold} gold`}
              {event.result.renown > 0 && ` · +${event.result.renown} guild renown`}
              {event.result.discovery && ` · Discovered ${event.result.discovery}`}
            </p>
          )}
          {event.options.length > 0 ? (
            <>
              <p>
                {event.retry ? 'Investigator retry' : 'Optional'} · {event.skill} · Available until{' '}
                {time(event.expiresAt)}
              </p>
              {event.options.map((option) => (
                <button
                  type="button"
                  key={option.id}
                  disabled={busy}
                  onClick={() =>
                    act({
                      action: event.retry ? 'retry' : 'event',
                      slot: event.slot,
                      option: option.id,
                    })
                  }
                >
                  {option.label}
                  <small>{option.effect}</small>
                </button>
              ))}
            </>
          ) : (
            !event.result && (
              <p>
                {Date.now() >= event.expiresAt
                  ? 'Challenge closed.'
                  : `Opens ${time(event.availableAt)}`}
              </p>
            )
          )}
        </section>
      ))}
    </article>
  );
}

export function Expeditions({
  request,
  profile,
  onChange,
}: {
  request: AccountApi;
  profile: GuildProfile;
  onChange: (profile: GuildProfile) => void;
}) {
  const [open, setOpen] = useState(false);
  const [board, setBoard] = useState<Board>();
  const [key, setKey] = useState('');
  const [modifier, setModifier] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => setBoard(await request<Board>('/expeditions')), [request]);
  useEffect(() => {
    if (!open) return;
    const refresh = () => void load().catch((err) => setError(accountError(err)));
    refresh();
    const interval = window.setInterval(refresh, 12_000);
    return () => window.clearInterval(interval);
  }, [open, load]);

  async function action(path: string, body: object) {
    setBusy(true);
    setError('');
    try {
      const options = { method: 'POST', body: JSON.stringify(body) };
      if (path === '/expeditions') {
        await request(path, options);
        setKey('');
        setModifier('');
        await load();
      } else {
        setBoard(await request<Board>(path, options));
      }
      onChange(await request<GuildProfile>('/me'));
    } catch (err) {
      setError(accountError(err));
    } finally {
      setBusy(false);
    }
  }

  const selected = board?.missions.find((mission) => mission.key === key);
  const committed =
    board?.parties.some(
      (party) =>
        ['recruiting', 'grace', 'running'].includes(party.state) &&
        party.roster.some(({ id }) => id === profile.memberId),
    ) ?? false;
  return (
    <details
      className="guild-admin expeditions"
      id="expedition-board"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>Expedition Board</summary>
      <div className="help-heading">
        <h3>Cooperative expeditions</h3>
        <HelpTip topic="expeditions">
          Parties need two to four members. Expeditions keep running after you close the game. Your
          standing order pauses during the trip and resumes when you are back and connected.
        </HelpTip>
      </div>
      {error && <p role="alert">{error}</p>}
      {!board ? (
        <p>Loading the board…</p>
      ) : (
        <>
          {!committed && (
            <label>
              Plan an expedition
              <select
                value={key}
                onChange={(event) => {
                  setKey(event.currentTarget.value);
                  setModifier('');
                }}
              >
                <option value="">Select an expedition</option>
                {board.missions.map((mission) => (
                  <option key={mission.key} value={mission.key} disabled={!mission.unlocked}>
                    {mission.title}
                    {!mission.unlocked && ' · Chronicle locked'}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!committed && selected && (
            <div className="expedition-card">
              <p>{selected.summary}</p>
              <p>
                Scribing strengthens renown findings, Research improves discovery odds, and
                Restoration improves Restoration checks.
              </p>
              <p>
                {selected.minutes} minutes ·{' '}
                {selected.tier === 'advanced'
                  ? 'One party member needs level '
                  : 'Recommended level '}
                {selected.recommendedLevel}
              </p>
              <p>
                Baseline per member · {expeditionRewards[selected.tier].xp} XP ·{' '}
                {expeditionRewards[selected.tier].gold} gold
              </p>
              {selected.tier !== 'tutorial' && board.modifiers?.length > 0 && (
                <>
                  <label>
                    Optional modifier
                    <select
                      value={modifier}
                      onChange={(event) => setModifier(event.currentTarget.value)}
                    >
                      <option value="">Standard conditions</option>
                      {board.modifiers.map((item) => (
                        <option key={item.key} value={item.key}>
                          {item.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  {modifier && (
                    <p>{board.modifiers.find((item) => item.key === modifier)?.description}</p>
                  )}
                </>
              )}
              <PartyChoices
                key={selected.key}
                mission={selected}
                busy={busy}
                label="Create party"
                onSubmit={(role, approach, delay) =>
                  void action('/expeditions', {
                    mission: selected.key,
                    role,
                    approach,
                    delay,
                    modifier: modifier || undefined,
                  })
                }
              />
            </div>
          )}
          {board.parties.map((party) => (
            <PartyCard
              key={party.id}
              party={party}
              mission={board.missions.find(({ key }) => key === party.mission)!}
              member={profile.memberId}
              role={profile.role}
              busy={busy}
              committed={committed}
              invitees={board.invitees}
              act={(body) => void action('/expeditions/' + party.id, body)}
            />
          ))}
          {!board.parties.length && <p>No parties on the board yet.</p>}
          <h3>The Unwritten Chronicle</h3>
          {board.chronicle.map((chapter) => (
            <section key={chapter.title} className="expedition-card">
              <h4>{chapter.title}</h4>
              <p>
                {chapter.expeditions}/{chapter.targetExpeditions} expeditions · {chapter.renown}/
                {chapter.targetRenown} renown · {chapter.clues.length}/{chapter.targetClues} clues
              </p>
              {chapter.clues.length > 0 && (
                <ul>
                  {chapter.clues.map((clue) => (
                    <li key={clue}>{clue}</li>
                  ))}
                </ul>
              )}
              {chapter.recap && <p>{chapter.recap}</p>}
            </section>
          ))}
        </>
      )}
    </details>
  );
}
