// Parses the Quick add title line: "Fix hreflang tags @karl fri !high"
//   @name     → assignee (matched on first name, then full name)
//   !urgent / !high / !medium / !low, or !1–!4 → priority
//   today, tomorrow, mon…sun, "next week" → due date
import dayjs from 'dayjs';
import type { Priority, User } from '../api/types';

export interface ParsedTitle {
  title: string;
  assigneeId: string | null;
  priority: Priority | null;
  dueDate: string | null;
}

const PRIORITY_WORDS: Record<string, Priority> = {
  urgent: 'urgent', '1': 'urgent',
  high: 'high', '2': 'high',
  medium: 'medium', med: 'medium', '3': 'medium',
  low: 'low', '4': 'low',
};

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function nextWeekday(target: number) {
  const today = dayjs();
  const delta = (target - today.day() + 7) % 7 || 7;
  return today.add(delta, 'day');
}

export function parseQuickTitle(raw: string, people: User[]): ParsedTitle {
  let text = ` ${raw} `;
  let assigneeId: string | null = null;
  let priority: Priority | null = null;
  let dueDate: string | null = null;

  text = text.replace(/\s@([\p{L}.-]+)/giu, (m, name: string) => {
    const n = name.toLowerCase();
    const hit = people.find((p) => p.name.toLowerCase().split(' ')[0] === n) ?? people.find((p) => p.name.toLowerCase().startsWith(n));
    if (!hit) return m;
    assigneeId = hit.id;
    return ' ';
  });

  text = text.replace(/\s!(\w+)/g, (m, word: string) => {
    const p = PRIORITY_WORDS[word.toLowerCase()];
    if (!p) return m;
    priority = p;
    return ' ';
  });

  text = text.replace(/\s(next week|today|tomorrow|tmrw|mon|tue|wed|thu|fri|sat|sun)(?=\s)/gi, (_m, word: string) => {
    const w = word.toLowerCase();
    if (w === 'today') dueDate = dayjs().format('YYYY-MM-DD');
    else if (w === 'tomorrow' || w === 'tmrw') dueDate = dayjs().add(1, 'day').format('YYYY-MM-DD');
    else if (w === 'next week') dueDate = nextWeekday(1).format('YYYY-MM-DD');
    else dueDate = nextWeekday(WEEKDAYS.indexOf(w)).format('YYYY-MM-DD');
    return ' ';
  });

  return { title: text.replace(/\s+/g, ' ').trim(), assigneeId, priority, dueDate };
}
