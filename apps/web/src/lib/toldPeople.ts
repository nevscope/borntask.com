export function joinNames(names: string[]): string {
  const uniq = [...new Set(names.map((name) => name.trim()).filter(Boolean))];
  if (uniq.length === 0) return '';
  if (uniq.length === 1) return uniq[0]!;
  if (uniq.length === 2) return `${uniq[0]} and ${uniq[1]}`;
  return `${uniq.slice(0, -1).join(', ')} and ${uniq[uniq.length - 1]}`;
}

/** Confirm body for delete with subtasks or bulk delete. */
export function trashToldCopy(names: string[]): string {
  const joined = joinNames(names);
  if (!joined) return 'They go to Trash for 30 days.';
  const verb = [...new Set(names.map((name) => name.trim()).filter(Boolean))].length === 1 ? 'is' : 'are';
  return `They go to Trash for 30 days, and ${joined} ${verb} told.`;
}
