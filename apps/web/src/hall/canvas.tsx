import type { HallMember } from '@guild/shared';
import { useEffect, useRef } from 'react';
import type { CSSProperties, MouseEvent } from 'react';
import { GameIcon } from '../game/icons';
import { hallHeight, hallWidth, landmarkAt, landmarks } from './geometry';

export interface HallVisualState {
  members: HallMember[];
  reducedMotion: boolean;
  wave?: { memberId: string; at: number };
}

type HallScene = ReturnType<typeof import('../hall').mountHall>;
type Landmark = (typeof landmarks)[number]['name'];

export function HallCanvas({
  members,
  reducedMotion,
  wave,
  onMember,
  onLandmark,
}: Partial<HallVisualState> & {
  onMember?: (id: string) => void;
  onLandmark?: (station: Landmark) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLElement>(null);
  const scene = useRef<HallScene>(null);
  const visual = useRef<HallVisualState>({ members: [], reducedMotion: false });
  useEffect(() => {
    visual.current = { members: members ?? [], reducedMotion: reducedMotion ?? false, wave };
  }, [members, reducedMotion, wave]);
  const live = members !== undefined;

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let disposed = false;
    void import('../hall')
      .then(({ mountHall }) => {
        if (!disposed) scene.current = mountHall(element, live ? () => visual.current : undefined);
      })
      .catch(() => {
        if (!disposed) element.dataset.renderFailed = 'true';
      });
    return () => {
      disposed = true;
      scene.current?.destroy();
      scene.current = null;
    };
  }, [live]);

  useEffect(() => {
    const element = stage.current;
    if (!live || !element) return;
    function fit() {
      if (!element) return;
      const { width, height } = element.getBoundingClientRect();
      if (!width || !height) return;
      const scale = Math.min(width / hallWidth, height / hallHeight);
      const ratio = window.devicePixelRatio || 1;
      const integer = Math.floor(scale * ratio + 0.00001) / ratio;
      const preferred = integer >= 2 ? integer : scale;
      element.style.setProperty('--hall-size', `${hallWidth * preferred}px`);
    }
    const resize = new ResizeObserver(fit);
    resize.observe(element);
    window.addEventListener('resize', fit);
    fit();
    return () => {
      resize.disconnect();
      window.removeEventListener('resize', fit);
    };
  }, [live]);

  function target(event: MouseEvent<HTMLElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const point = {
      x: ((event.clientX - bounds.left) * hallWidth) / bounds.width,
      y: ((event.clientY - bounds.top) * hallHeight) / bounds.height,
    };
    return { member: scene.current?.memberAt(point), landmark: landmarkAt(point) };
  }

  return (
    <figure ref={stage} className={live ? 'hall game-stage' : 'hall'}>
      <div className="hall-viewport">
        <div
          ref={host}
          className="hall-art"
          role="img"
          aria-label={
            live
              ? 'Pixel-art guild hall with connected guild members'
              : 'An empty pixel-art guild hall with bookshelves, wooden desks and a glowing hearth'
          }
          onMouseMove={
            live
              ? (event) => {
                  const { member, landmark } = target(event);
                  event.currentTarget.style.cursor = member || landmark ? 'pointer' : '';
                }
              : undefined
          }
          onClick={
            live
              ? (event) => {
                  const { member, landmark } = target(event);
                  if (member) onMember?.(member);
                  else if (landmark) onLandmark?.(landmark);
                }
              : undefined
          }
        />
        {live &&
          landmarks
            .filter(({ label }) => label !== false)
            .map(({ name, icon, x, y, width, height }) => (
              <button
                key={name}
                type="button"
                className="hall-landmark"
                style={
                  {
                    '--landmark-x': `${((x + width / 2) / hallWidth) * 100}%`,
                    '--landmark-y': `${((y + (name === 'Lounge' ? height + 4 : -7)) / hallHeight) * 100}%`,
                  } as CSSProperties
                }
                onClick={() => onLandmark?.(name)}
              >
                <GameIcon name={icon} />
                <span>{name}</span>
              </button>
            ))}
      </div>
      {!live && <figcaption>The Guild Hall</figcaption>}
    </figure>
  );
}
