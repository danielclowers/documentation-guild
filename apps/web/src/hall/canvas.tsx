import type { HallMember } from '@guild/shared';
import { useEffect, useRef } from 'react';

export interface HallVisualState {
  members: HallMember[];
  reducedMotion: boolean;
  wave?: { memberId: string; at: number };
}

export function HallCanvas({ members, reducedMotion, wave }: Partial<HallVisualState>) {
  const host = useRef<HTMLDivElement>(null);
  const visual = useRef<HallVisualState>({ members: [], reducedMotion: false });
  useEffect(() => {
    visual.current = { members: members ?? [], reducedMotion: reducedMotion ?? false, wave };
  }, [members, reducedMotion, wave]);
  const live = members !== undefined;

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let dispose: (() => void) | undefined;
    let disposed = false;
    void import('../hall')
      .then(({ mountHall }) => {
        if (!disposed) dispose = mountHall(element, live ? () => visual.current : undefined);
      })
      .catch(() => {
        if (!disposed) element.dataset.renderFailed = 'true';
      });
    return () => {
      disposed = true;
      dispose?.();
    };
  }, [live]);

  return (
    <figure className="hall">
      <div
        ref={host}
        className="hall-art"
        role="img"
        aria-label={
          live
            ? 'Pixel-art guild hall with connected guild members'
            : 'An empty pixel-art guild hall with bookshelves, wooden desks and a glowing hearth'
        }
      />
      {!live && <figcaption>The Guild Hall</figcaption>}
    </figure>
  );
}
