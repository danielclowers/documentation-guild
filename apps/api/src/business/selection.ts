import { caseMetadata } from './cases';
import { newCaseDefinitions, shuffled } from './new-cases';

const keys = [...newCaseDefinitions.keys()];

export function nextCase(
  position: number,
  level: number,
  active: string[],
  recent: string[],
  seed: number,
) {
  if (position === 0) return 'pages_in_order';
  const activeCases = active.flatMap((key) => {
    const metadata = caseMetadata.get(key);
    return metadata ? [metadata] : [];
  });
  const needsQuick = active.length === 2 && !activeCases.some(({ quick }) => quick);
  const advanced = level >= 3 && !activeCases.some(({ difficulty }) => difficulty === 'advanced');
  const candidates = shuffled(keys, seed).filter((key) => {
    const item = caseMetadata.get(key)!;
    return (
      !active.includes(key) &&
      !activeCases.some(({ title }) => title === item.title) &&
      (advanced || item.difficulty !== 'advanced') &&
      (!needsQuick || item.quick)
    );
  });
  const wantsAdvanced = advanced && position % 4 === 3;
  function score(key: string) {
    const item = caseMetadata.get(key)!;
    const last = recent.indexOf(key);
    return (
      (last >= 0 ? (recent.length - last) * 20 : 0) +
      activeCases.filter(({ skill }) => skill === item.skill).length * 5 +
      activeCases.filter(({ family }) => family === item.family).length * 6 +
      Number((item.difficulty === 'advanced') !== wantsAdvanced) * 3
    );
  }
  return candidates.sort((a, b) => score(a) - score(b))[0]!;
}
