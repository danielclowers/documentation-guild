import { useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { GameIcon } from './icons';
import type { IconName } from './icons';

export const menus = {
  orders: { title: 'Standing Orders', icon: 'orders' },
  business: { title: 'Guild Business', icon: 'business' },
  expeditions: { title: 'Expedition Board', icon: 'expeditions' },
  character: { title: 'Character & Skills', icon: 'character' },
  training: { title: 'Training & Specializations', icon: 'training' },
  journal: { title: 'Journal & Chronicle', icon: 'journal' },
  activity: { title: 'Guild Activity', icon: 'activity' },
  admin: { title: 'Guild Administration', icon: 'admin' },
  settings: { title: 'Settings & Help', icon: 'settings' },
  people: { title: 'Guild Members', icon: 'people' },
  recap: { title: 'While you were away', icon: 'activity' },
} satisfies Record<string, { title: string; icon: IconName }>;

export type MenuId = keyof typeof menus;

export function GameMenu({
  active,
  available,
  onOpen,
  onClose,
  children,
}: {
  active: MenuId | null;
  available: MenuId[];
  onOpen: (menu: MenuId) => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const settings = active === 'settings';
  const returnFocus = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const world = element.previousElementSibling;
    if (active) {
      if (!element.open)
        returnFocus.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
      // Clerk's password reverification renders its own modal outside the game menu.
      if (element.open && element.matches(':modal') === settings) element.close();
      if (!element.open) {
        if (settings) element.show();
        else element.showModal();
      }
      if (world instanceof HTMLElement) world.inert = settings;
      if (scroll.current) scroll.current.scrollTop = 0;
      heading.current?.focus();
    } else if (element.open) {
      if (world instanceof HTMLElement) world.inert = false;
      element.close();
      const previous = returnFocus.current;
      if (previous?.isConnected && previous !== document.body) previous.focus();
      else world?.querySelector<HTMLElement>('[data-hall-focus]')?.focus();
      returnFocus.current = null;
    }
  }, [active, settings]);

  const current = active ? menus[active] : null;
  return (
    <dialog
      ref={dialog}
      className="rpg-dialog"
      data-panel={active ?? undefined}
      aria-labelledby="game-menu-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={(event) => {
        if (!settings || event.defaultPrevented) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
        } else if (event.key === 'Tab') {
          const controls = Array.from(
            event.currentTarget.querySelectorAll<HTMLElement>(
              'button, input, select, summary, a[href]',
            ),
          ).filter((item) => !item.matches(':disabled') && item.getClientRects().length > 0);
          const first = controls[0];
          const last = controls.at(-1);
          if (
            event.shiftKey &&
            (document.activeElement === first || document.activeElement === heading.current)
          ) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="rpg-menu">
        <header className="rpg-menu-header">
          {current && <GameIcon name={current.icon} />}
          <h2 ref={heading} id="game-menu-title" tabIndex={-1}>
            {current?.title}
          </h2>
          <button type="button" className="menu-close" aria-label="Close menu" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="rpg-menu-body" ref={scroll}>
          {children}
        </div>
        <footer className="rpg-menu-footer">
          <label htmlFor="game-menu-switch">Go to</label>
          <select
            id="game-menu-switch"
            value={active ?? ''}
            onChange={(event) => onOpen(event.target.value as MenuId)}
          >
            {available.map((id) => (
              <option key={id} value={id}>
                {menus[id].title}
              </option>
            ))}
          </select>
          <button type="button" onClick={onClose}>
            Return to hall
          </button>
        </footer>
      </div>
    </dialog>
  );
}
