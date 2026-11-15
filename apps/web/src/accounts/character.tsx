import { characterSchema, hairColors, hairStyles, tunicColors } from '@guild/shared';
import type { CharacterAppearance } from '@guild/shared';
import { useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { accountError } from './api';

const hairPalette = ['#78442e', '#302830', '#aa5142', '#d2a661', '#b8aeb2'];
const tunicPalette = ['#527a64', '#656397', '#a05458', '#ae7d40', '#815779'];

export const startingAppearance: CharacterAppearance = {
  displayName: '',
  hairStyle: 0,
  hairColor: 0,
  tunicColor: 0,
};

export function AvatarPreview({ appearance }: { appearance: CharacterAppearance }) {
  const style = {
    '--hair': hairPalette[appearance.hairColor],
    '--tunic': tunicPalette[appearance.tunicColor],
  } as CSSProperties;
  return (
    <span
      className="avatar-preview"
      role="img"
      style={style}
      aria-label={`${hairStyles[appearance.hairStyle]} ${hairColors[appearance.hairColor]} hair and ${tunicColors[appearance.tunicColor]} tunic`}
    >
      <span className={`avatar-sprite hair-${appearance.hairStyle}`}>
        <i />
        <b />
        <em />
      </span>
    </span>
  );
}

export function CharacterFields({
  value,
  onChange,
}: {
  value: CharacterAppearance;
  onChange: (value: CharacterAppearance) => void;
}) {
  return (
    <fieldset className="character-fields">
      <legend>Your character</legend>
      <div className="character-options">
        <AvatarPreview appearance={value} />
        <label>
          Display name
          <input
            name="displayName"
            required
            minLength={2}
            maxLength={24}
            value={value.displayName}
            onChange={(event) => onChange({ ...value, displayName: event.currentTarget.value })}
          />
        </label>
      </div>
      {(
        [
          ['hairStyle', 'Hairstyle', hairStyles],
          ['hairColor', 'Hair color', hairColors],
          ['tunicColor', 'Tunic color', tunicColors],
        ] as const
      ).map(([key, label, options]) => (
        <label key={key}>
          {label}
          <select
            value={value[key]}
            onChange={(event) => onChange({ ...value, [key]: Number(event.currentTarget.value) })}
          >
            {options.map((option, index) => (
              <option key={option} value={index}>
                {option}
              </option>
            ))}
          </select>
        </label>
      ))}
    </fieldset>
  );
}

export function CharacterEditor({
  value,
  onSave,
  onCancel,
}: {
  value: CharacterAppearance;
  onSave: (appearance: CharacterAppearance) => Promise<void>;
  onCancel?: () => void;
}) {
  const [appearance, setAppearance] = useState<CharacterAppearance>(() => {
    const { displayName, hairStyle, hairColor, tunicColor } = value;
    return { displayName, hairStyle, hairColor, tunicColor };
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save(event: FormEvent) {
    event.preventDefault();
    setError('');
    const result = characterSchema.safeParse(appearance);
    if (!result.success) {
      setError(
        'Use 2 to 24 letters, numbers, spaces, apostrophes, periods, or hyphens for the display name.',
      );
      return;
    }
    setBusy(true);
    try {
      await onSave(result.data);
    } catch (err) {
      setError(accountError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="account-form" onSubmit={(event) => void save(event)}>
      <CharacterFields value={appearance} onChange={setAppearance} />
      {error && <p role="alert">{error}</p>}
      <div className="game-actions">
        <button type="submit" disabled={busy}>
          Save character
        </button>
        {onCancel && (
          <button type="button" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
