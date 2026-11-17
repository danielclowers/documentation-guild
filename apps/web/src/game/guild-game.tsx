import { characterLevel, characterXpForLevel, skillSchema, standingOrders } from '@guild/shared';
import type { BusinessReward, CharacterAppearance, GuildProfile, Skill } from '@guild/shared';
import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { AccountApi } from '../accounts/api';
import { AdminPanel } from '../accounts/admin';
import { GuildBusiness } from '../accounts/business';
import { AvatarPreview, CharacterEditor } from '../accounts/character';
import { PayoutTimer, StandingOrders } from '../accounts/standing-orders';
import { Training } from '../accounts/training';
import { Expeditions } from '../expeditions/board';
import { HallCanvas } from '../hall/canvas';
import { useHallConnection } from '../hall/connection';
import { HallMembers, HallSettings } from '../hall/live-hall';
import { FAQ } from '../help';
import { GuildNoticeboard, Journal, useGuildRecap, WhileYouWereAway } from '../story/panels';
import { GameIcon } from './icons';
import { GuildGuide, guideSteps } from './guide';
import { HelpTip } from '../help';
import { GameMenu, menus } from './menu';
import type { MenuId } from './menu';

type Character = NonNullable<GuildProfile['character']>;
const primaryMenus = [
  ['orders', 'Orders'],
  ['business', 'Guild Business'],
  ['expeditions', 'Expeditions'],
  ['character', 'Character'],
  ['training', 'Training'],
  ['journal', 'Journal'],
  ['activity', 'Activity'],
  ['settings', 'Settings'],
] as const;
const getPreference = (key: string, fallback: boolean) => {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === 'true';
  } catch {
    return fallback;
  }
};

function CharacterSheet({
  character,
  onSaveAppearance,
}: {
  character: Character;
  onSaveAppearance: (appearance: CharacterAppearance) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="panel-content">
      <div className="member-profile">
        <AvatarPreview appearance={character} />
        <div>
          <h3>{character.displayName}</h3>
          <p>
            Level {character.level} · {character.xp.toLocaleString()} XP ·{' '}
            {character.gold.toLocaleString()} gold
          </p>
          {character.progression.specialization && <p>{character.progression.specialization}</p>}
        </div>
      </div>
      {editing ? (
        <CharacterEditor
          value={character}
          onSave={async (appearance) => {
            await onSaveAppearance(appearance);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <button type="button" onClick={() => setEditing(true)}>
          Edit character
        </button>
      )}
      <section className="parchment">
        <div className="help-heading">
          <h3>Skills</h3>
          <HelpTip topic="skills and experience">
            Character XP increases your overall level. Each skill earns its own XP. Higher skill
            levels improve your chances on matching expedition challenges.
          </HelpTip>
        </div>
        <ul className="skill-records">
          {skillSchema.options.map((skill) => (
            <li key={skill}>
              <strong>{skill}</strong>
              <span>
                Level {character.progression.skills[skill].level} ·{' '}
                {character.progression.skills[skill].xp.toLocaleString()} XP
              </span>
            </li>
          ))}
        </ul>
        <p>
          {character.level < 3
            ? 'Next unlock · Training at level 3.'
            : character.level < 10
              ? 'Next unlock · Specializations at level 10.'
              : 'Training and specializations are available from the dock.'}
        </p>
      </section>
    </div>
  );
}

function Experience({ character }: { character: Character }) {
  const from = characterXpForLevel(character.level);
  const next = characterXpForLevel(character.level + 1);
  const capped = characterLevel(next) === character.level;
  const range = next - from;
  const progress = capped ? range : Math.min(range, Math.max(0, character.xp - from));
  return (
    <div className="hud-xp">
      <span>
        {character.xp.toLocaleString()} XP {capped ? '· Max level' : `/ ${next.toLocaleString()}`}
      </span>
      <progress
        aria-label={capped ? 'Maximum level reached' : 'Experience toward next level'}
        value={progress}
        max={range}
      />
    </div>
  );
}

export function GuildGame({
  apiUrl,
  profile,
  request,
  onChange,
  onConnection,
  onSaveAppearance,
  onSignOut,
  accountSettings,
  showHelp,
  onDismissHelp,
}: {
  apiUrl: string;
  profile: GuildProfile & { character: Character };
  request: AccountApi;
  onChange: (profile: GuildProfile) => void;
  onConnection: (connected: boolean) => void;
  onSaveAppearance: (appearance: CharacterAppearance) => Promise<void>;
  onSignOut: () => void;
  accountSettings: ReactNode;
  showHelp?: boolean;
  onDismissHelp?: () => void;
}) {
  const character = profile.character;
  const { members, status, wave, sendWave } = useHallConnection(apiUrl, request);
  const connected = status === 'connected';
  const [menu, setMenu] = useState<MenuId | null>(null);
  const [visited, setVisited] = useState<Set<MenuId>>(() => new Set());
  const [orderChoice, setOrderChoice] = useState<{ skill?: Skill; revision: number }>({
    revision: 0,
  });
  const [selectedMember, setSelectedMember] = useState<string>();
  const [reducedMotion, setReducedMotion] = useState(() =>
    getPreference('guild.reduce-motion', matchMedia('(prefers-reduced-motion: reduce)').matches),
  );
  const [mute, setMute] = useState(() => getPreference('guild.mute-waves', false));
  const recap = useGuildRecap(request, character.id);
  const guideKey = 'guild.tour.' + character.id;
  const [guide, setGuide] = useState<number | null>(() =>
    character.tutorialStatus === 'pending' && !getPreference(guideKey, false) ? 0 : null,
  );
  const [solved, setSolved] = useState(false);
  const [journalKey, setJournalKey] = useState<string>();
  const clearJournalFocus = useCallback(() => setJournalKey(undefined), []);
  const [noticed, setNoticed] = useState<Set<MenuId>>(() => new Set());
  const [newFind, setNewFind] = useState(false);

  useEffect(() => {
    if (connected && character.tutorialStatus === 'pending' && getPreference(guideKey, false))
      void request('/me/tutorial', { method: 'PUT' }).catch(() => undefined);
  }, [connected, character.tutorialStatus, guideKey, request]);

  const endGuide = () => {
    setGuide(null);
    if (character.tutorialStatus !== 'pending') return;
    try {
      localStorage.setItem(guideKey, 'true');
    } catch {
      /* The account still records completion. */
    }
    void request('/me/tutorial', { method: 'PUT' }).catch(() => undefined);
  };

  useEffect(() => {
    onConnection(connected);
    return () => onConnection(false);
  }, [connected, onConnection]);

  useEffect(() => {
    try {
      localStorage.setItem('guild.reduce-motion', String(reducedMotion));
      localStorage.setItem('guild.mute-waves', String(mute));
    } catch {
      /* These preferences still apply for the session. */
    }
  }, [reducedMotion, mute]);

  const admin = profile.role === 'admin';
  const available = primaryMenus.map(([id]): MenuId => id);
  available.push('people');
  if (admin) available.push('admin');
  if (recap) available.push('recap');
  const open = useCallback(
    (id: MenuId) => {
      setVisited((items) => (items.has(id) ? items : new Set(items).add(id)));
      setMenu(id);
      setNoticed((seen) => (seen.has(id) ? seen : new Set(seen).add(id)));
      if (id === 'journal') {
        setNewFind(false);
        setJournalKey(undefined);
      }
      if (id !== 'settings') onDismissHelp?.();
    },
    [onDismissHelp],
  );
  useEffect(() => {
    if (showHelp) open('settings');
  }, [showHelp, open]);
  const close = () => {
    setMenu(null);
    onDismissHelp?.();
  };

  const display = (id: MenuId, body: ReactNode) =>
    visited.has(id) ? (
      <div key={id} hidden={menu !== id}>
        {body}
      </div>
    ) : null;

  function openJournal(key: string) {
    open('journal');
    setJournalKey(key);
  }
  function afterCase(reward: BusinessReward) {
    setSolved(true);
    if (reward.discovery && !reward.discovery.known) setNewFind(true);
  }
  function moveGuide(index: number) {
    setMenu(null);
    setGuide(index);
  }
  const showAttention = (id: MenuId) => {
    if (id === 'journal' && newFind) return true;
    if (!recap || noticed.has(id)) return false;
    if (id === 'expeditions')
      return Boolean(recap.invitations || recap.challenges || recap.returned.length);
    if (id === 'journal') return recap.discoveries > 0;
    return id === 'activity' && recap.milestones > 0;
  };
  const guideCard = (inMenu: boolean) =>
    guide !== null && (
      <GuildGuide
        index={guide}
        inMenu={inMenu}
        order={Boolean(character.progression.order)}
        solved={solved}
        onMove={moveGuide}
        onOpen={open}
        onEnd={endGuide}
      />
    );

  const own = members.find(({ id }) => id === profile.memberId);
  const order = character.progression.order;
  const onExpedition = character.progression.onExpedition || Boolean(own?.expeditionAt);
  const hallStatus = {
    connecting: 'Connecting…',
    connected: `${members.length} online`,
    reconnecting: 'Reconnecting…',
    denied: 'Access ended',
  }[status];

  return (
    <div className="guild-game" data-reduced-motion={reducedMotion}>
      <div className="game-world">
        {!menu && guideCard(false)}
        <header className="game-hud">
          <div className="hud-character">
            <button
              type="button"
              className="hud-identity"
              onClick={() => open('character')}
              aria-label={`Character & Skills for ${character.displayName}`}
            >
              <AvatarPreview appearance={character} />
              <span>
                <strong>{character.displayName}</strong>
                <small>
                  Level {character.level}
                  {character.progression.specialization &&
                    ` · ${character.progression.specialization}`}
                </small>
              </span>
            </button>
            <Experience character={character} />
          </div>
          <h1 className="guild-title">
            <GameIcon name="journal" />
            <span>The Documentation Guild</span>
          </h1>
          <div className="hud-status">
            <span className="hud-gold">
              <GameIcon name="coin" />
              <span>
                {character.gold.toLocaleString()} <span>gold</span>
              </span>
            </span>
            <button
              type="button"
              className="hud-orders"
              onClick={() => open('orders')}
              aria-label="Standing Orders status"
            >
              <GameIcon name="orders" />
              <span>
                <strong>{order?.skill ?? 'Standing orders'}</strong>
                <small>
                  {onExpedition ? (
                    'On expedition'
                  ) : order ? (
                    <PayoutTimer order={order} hallConnected={connected} compact />
                  ) : (
                    'No assignment'
                  )}
                </small>
              </span>
            </button>
            <button
              type="button"
              className="hud-online"
              data-hall-focus
              onClick={() => {
                setSelectedMember(undefined);
                open('people');
              }}
              aria-label={`Guild members, ${hallStatus}`}
            >
              <span className="online-light" data-connected={connected} />
              <span role="status">{hallStatus}</span>
            </button>
            {recap && (
              <button
                type="button"
                className="hud-recap"
                aria-label={menus.recap.title}
                onClick={() => open('recap')}
              >
                <GameIcon name="activity" />
              </button>
            )}
          </div>
        </header>

        <HallCanvas
          members={members}
          reducedMotion={reducedMotion}
          wave={mute ? undefined : wave}
          onMember={(id) => {
            if (id === profile.memberId) open('character');
            else {
              setSelectedMember(id);
              open('people');
            }
          }}
          onLandmark={(station) => {
            if (station === 'Expedition Board') open('expeditions');
            else if (station === 'Lounge') {
              setSelectedMember(undefined);
              open('people');
            } else {
              setOrderChoice(({ revision }) => ({
                skill: skillSchema.options.find(
                  (skill) => standingOrders[skill].station === station,
                ),
                revision: revision + 1,
              }));
              open('orders');
            }
          }}
        />

        <nav className="game-dock" aria-label="Guild game menus">
          {primaryMenus.map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-label={menus[id].title}
              onClick={() => open(id)}
              data-guide-target={
                guide !== null && guideSteps[guide]?.menu === id ? 'true' : undefined
              }
              data-attention={showAttention(id) ? 'true' : undefined}
              aria-description={showAttention(id) ? 'Updates available' : undefined}
            >
              <GameIcon name={menus[id].icon} />
              <span>{label}</span>
            </button>
          ))}
          {admin && (
            <button type="button" aria-label={menus.admin.title} onClick={() => open('admin')}>
              <GameIcon name="admin" />
              <span>Admin</span>
            </button>
          )}
        </nav>
      </div>

      <GameMenu active={menu} available={available} onOpen={open} onClose={close}>
        {menu && guideCard(true)}
        {display(
          'orders',
          <StandingOrders
            key={orderChoice.revision}
            character={character}
            request={request}
            onChange={onChange}
            hallConnected={connected}
            suggested={orderChoice.skill}
          />,
        )}
        {display(
          'business',
          <GuildBusiness
            request={request}
            onChange={onChange}
            visible={menu === 'business'}
            onJournal={openJournal}
            onComplete={afterCase}
          />,
        )}
        {display(
          'expeditions',
          <Expeditions
            request={request}
            profile={profile}
            onChange={onChange}
            visible={menu === 'expeditions'}
            onJournal={openJournal}
          />,
        )}
        {display(
          'character',
          <CharacterSheet character={character} onSaveAppearance={onSaveAppearance} />,
        )}
        {display(
          'training',
          <Training character={character} request={request} onChange={onChange} />,
        )}
        {display(
          'journal',
          <Journal
            request={request}
            visible={menu === 'journal'}
            focusKey={journalKey}
            onRead={clearJournalFocus}
          />,
        )}
        {display('activity', <GuildNoticeboard request={request} visible={menu === 'activity'} />)}
        {admin && display('admin', <AdminPanel request={request} visible={menu === 'admin'} />)}
        {display(
          'settings',
          <>
            <HallSettings
              request={request}
              own={own}
              reducedMotion={reducedMotion}
              mute={mute}
              onMotion={setReducedMotion}
              onMute={setMute}
            />
            <section className="panel-content">
              <h3>Help &amp; FAQ</h3>
              <button
                type="button"
                onClick={() => {
                  close();
                  setGuide(0);
                }}
              >
                Replay guild tour
              </button>
              <FAQ />
            </section>
            <section className="panel-content">
              <h3>Account</h3>
              {accountSettings}
              <button type="button" onClick={onSignOut}>
                Sign out
              </button>
            </section>
          </>,
        )}
        {display(
          'people',
          <HallMembers
            members={members}
            memberId={profile.memberId}
            selected={selectedMember}
            onSelect={setSelectedMember}
            onWave={sendWave}
            onCharacter={() => open('character')}
          />,
        )}
        {recap &&
          display(
            'recap',
            <WhileYouWereAway
              recap={recap}
              onExpeditions={() => open('expeditions')}
              onJournal={() => open('journal')}
            />,
          )}
      </GameMenu>
    </div>
  );
}
