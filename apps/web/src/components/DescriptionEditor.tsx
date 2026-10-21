import Mention from '@tiptap/extension-mention';
import Placeholder from '@tiptap/extension-placeholder';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion';
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import type { User } from '../api/types';
import { persistDescription, toEditorHtml } from '../lib/descriptionHtml';
import { color, font, radius } from '../theme/tokens';

interface Props {
  value: string;
  onChange: (html: string) => void;
  onBlur?: (html: string) => void;
  onFocusChange?: (focused: boolean) => void;
  people?: User[];
  placeholder?: string;
  minHeight?: number;
  compact?: boolean;
  showPasteHint?: boolean;
  ariaLabel?: string;
  onEditorKeyDown?: (event: KeyboardEvent) => void;
}

export function DescriptionEditor({
  value,
  onChange,
  onBlur,
  onFocusChange,
  people = [],
  placeholder = 'Add details.',
  minHeight = 140,
  compact = false,
  showPasteHint = true,
  ariaLabel = 'Description',
  onEditorKeyDown,
}: Props) {
  const peopleRef = useRef(people);
  peopleRef.current = people;
  const focusCb = useRef(onFocusChange);
  focusCb.current = onFocusChange;
  const applying = useRef(false);
  const [focused, setFocused] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);

  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        horizontalRule: false,
        strike: false,
        underline: false,
        link: {
          openOnClick: false,
          autolink: true,
          HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
        },
      }),
      Placeholder.configure({ placeholder }),
      Mention.configure({
        HTMLAttributes: { class: 'bt-mention' },
        suggestion: mentionSuggestion(peopleRef),
      }),
    ],
    content: toEditorHtml(value),
    editorProps: {
      attributes: {
        'aria-label': ariaLabel,
        class: compact ? 'bt-desc-surface bt-desc-compact' : 'bt-desc-surface',
      },
    },
    onUpdate: ({ editor: next }) => {
      if (applying.current) return;
      onChange(persistDescription(next.isEmpty ? '' : next.getHTML()));
    },
    onFocus: () => {
      setFocused(true);
      focusCb.current?.(true);
    },
    onBlur: ({ editor: next }) => {
      setFocused(false);
      focusCb.current?.(false);
      const html = persistDescription(next.isEmpty ? '' : next.getHTML());
      onChange(html);
      onBlur?.(html);
    },
  });

  useEffect(() => {
    if (!editor || focused) return;
    const next = toEditorHtml(value);
    const current = persistDescription(editor.isEmpty ? '' : editor.getHTML());
    if (current === persistDescription(next)) return;
    applying.current = true;
    editor.commands.setContent(next || '', { emitUpdate: false });
    applying.current = false;
  }, [editor, value, focused]);

  useEffect(() => {
    if (!mentionOpen) return;
    const close = (event: MouseEvent) => {
      const target = event.target as Node | null;
      const pickerId = `bt-mention-picker-${ariaLabel.replace(/\s+/g, '-')}`;
      if (target && !document.getElementById(pickerId)?.contains(target) && !(target as HTMLElement).closest?.('[aria-label="Mention someone"]')) {
        setMentionOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [mentionOpen, ariaLabel]);

  return (
    <div style={{ position: 'relative' }}>
      <Toolbar
        editor={editor}
        focused={focused}
        mentionOpen={mentionOpen}
        people={people}
        showPasteHint={showPasteHint}
        pickerId={`bt-mention-picker-${ariaLabel.replace(/\s+/g, '-')}`}
        onMention={() => {
          if (!editor) return;
          editor.chain().focus().run();
          setMentionOpen((open) => !open);
        }}
        onPickMention={(person) => {
          if (!editor) return;
          editor.chain().focus().insertContent({ type: 'mention', attrs: { id: person.id, label: person.name } }).insertContent('\u00a0').run();
          setMentionOpen(false);
        }}
      />
      <div
        onKeyDown={onEditorKeyDown}
        style={{
          marginTop: -1,
          minHeight,
          padding: compact ? '8px 12px' : '10px 14px',
          border: `1px solid ${focused ? color.brand : color.border}`,
          borderRadius: '0 0 10px 10px',
          boxShadow: focused ? `0 0 0 3px ${color.brandTint}` : 'none',
          background: color.subtle,
          fontSize: 14,
          lineHeight: 1.55,
          color: color.ink2,
        }}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function Toolbar({
  editor,
  focused,
  mentionOpen,
  people,
  showPasteHint,
  pickerId,
  onMention,
  onPickMention,
}: {
  editor: Editor | null;
  focused: boolean;
  mentionOpen: boolean;
  people: User[];
  showPasteHint: boolean;
  pickerId: string;
  onMention: () => void;
  onPickMention: (person: User) => void;
}) {
  const tool = (label: string, active: boolean, run: () => void, style?: CSSProperties) => (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onMouseDown={(event) => event.preventDefault()}
      onClick={run}
      style={{
        width: label === 'Link' ? 40 : 32,
        height: 30,
        border: 0,
        borderRadius: 6,
        background: active ? color.brandTint : 'transparent',
        font: 'inherit',
        cursor: 'pointer',
        color: color.ink,
        ...style,
      }}
    >
      {label === 'Bold' ? 'B' : label === 'Italic' ? 'I' : label === 'Numbered list' ? '1.' : label === 'Bulleted list' ? '•' : label === 'Code' ? '</>' : label === 'Link' ? 'Link' : '@'}
    </button>
  );

  function setLink() {
    if (!editor) return;
    const prev = String(editor.getAttributes('link').href ?? '');
    const next = window.prompt('Paste a web address', prev || 'https://');
    if (next === null) return;
    const href = next.trim();
    if (!href) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
  }

  function code() {
    if (!editor) return;
    if (editor.isActive('codeBlock')) {
      editor.chain().focus().toggleCodeBlock().run();
      return;
    }
    if (!editor.state.selection.empty) {
      editor.chain().focus().toggleCode().run();
      return;
    }
    editor.chain().focus().toggleCodeBlock().run();
  }

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 2,
        padding: 4,
        border: `1px solid ${focused ? color.brand : color.border}`,
        borderBottom: 0,
        borderRadius: '10px 10px 0 0',
        background: color.subtle,
      }}
    >
      {tool('Bold', !!editor?.isActive('bold'), () => editor?.chain().focus().toggleBold().run(), { fontWeight: 700 })}
      {tool('Italic', !!editor?.isActive('italic'), () => editor?.chain().focus().toggleItalic().run(), { fontStyle: 'italic' })}
      {tool('Numbered list', !!editor?.isActive('orderedList'), () => editor?.chain().focus().toggleOrderedList().run(), { fontSize: 12 })}
      {tool('Bulleted list', !!editor?.isActive('bulletList'), () => editor?.chain().focus().toggleBulletList().run())}
      {tool('Code', !!(editor?.isActive('code') || editor?.isActive('codeBlock')), code, { fontFamily: font.mono, fontSize: 12 })}
      {tool('Link', !!editor?.isActive('link'), setLink, { fontSize: 12 })}
      {tool('Mention someone', mentionOpen, onMention)}
      <span style={{ flex: 1 }} />
      {showPasteHint && <span style={{ padding: '0 6px', fontSize: 12, color: color.muted }}>Paste images straight in</span>}
      {mentionOpen && (
        <div
          id={pickerId}
          role="listbox"
          aria-label="People"
          style={{
            position: 'absolute',
            top: '100%',
            left: 8,
            zIndex: 20,
            minWidth: 220,
            maxHeight: 220,
            overflow: 'auto',
            marginTop: 4,
            padding: 4,
            border: `1px solid ${color.border}`,
            borderRadius: radius.md,
            background: color.surface,
            boxShadow: `0 8px 24px ${color.shadow}`,
          }}
        >
          {people.length === 0 ? (
            <div style={{ padding: '8px 10px', fontSize: 13, color: color.muted }}>No people on this project yet.</div>
          ) : (
            people.map((person) => (
              <button
                key={person.id}
                type="button"
                role="option"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onPickMention(person)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  border: 0,
                  borderRadius: radius.sm,
                  padding: '6px 8px',
                  font: 'inherit',
                  fontSize: 13,
                  background: 'transparent',
                  color: color.ink,
                  cursor: 'pointer',
                }}
              >
                {person.name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function mentionSuggestion(peopleRef: { current: User[] }) {
  return {
    items: ({ query }: { query: string }) => {
      const q = query.toLowerCase();
      return peopleRef.current
        .filter((person) => person.name.toLowerCase().includes(q) || person.email.toLowerCase().includes(q))
        .slice(0, 8);
    },
    render: () => {
      let root: HTMLDivElement | null = null;
      let unmount: (() => void) | undefined;
      let selected = 0;
      let current: SuggestionProps<User> | null = null;

      function paint(props: SuggestionProps<User>) {
        current = props;
        if (!root) return;
        root.replaceChildren();
        if (!props.items.length) {
          const empty = document.createElement('div');
          empty.textContent = peopleRef.current.length ? 'No matching people' : 'Type @ then a name when the project has people';
          empty.style.cssText = `padding:8px 10px;font-size:13px;color:${color.muted}`;
          root.appendChild(empty);
          return;
        }
        props.items.forEach((person, index) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.setAttribute('role', 'option');
          btn.textContent = person.name;
          btn.style.cssText = [
            'display:block',
            'width:100%',
            'text-align:left',
            'border:0',
            `border-radius:${radius.sm}px`,
            'padding:6px 8px',
            'font:inherit',
            'font-size:13px',
            `background:${index === selected ? color.brandTint : 'transparent'}`,
            `color:${color.ink}`,
            'cursor:pointer',
          ].join(';');
          btn.onmousedown = (event) => {
            event.preventDefault();
            props.command({ id: person.id, label: person.name });
          };
          root!.appendChild(btn);
        });
      }

      return {
        onStart(props: SuggestionProps<User>) {
          selected = 0;
          root = document.createElement('div');
          root.setAttribute('role', 'listbox');
          root.style.cssText = [
            `z-index:2000`,
            `min-width:180px`,
            `padding:4px`,
            `border:1px solid ${color.border}`,
            `border-radius:${radius.md}px`,
            `background:${color.surface}`,
          ].join(';');
          unmount = props.mount(root);
          paint(props);
        },
        onUpdate(props: SuggestionProps<User>) {
          selected = 0;
          paint(props);
        },
        onKeyDown({ event }: SuggestionKeyDownProps) {
          if (!current?.items.length) return event.key === 'Enter';
          if (event.key === 'ArrowDown') {
            selected = Math.min(selected + 1, current.items.length - 1);
            paint(current);
            return true;
          }
          if (event.key === 'ArrowUp') {
            selected = Math.max(selected - 1, 0);
            paint(current);
            return true;
          }
          if (event.key === 'Enter') {
            const person = current.items[selected];
            if (person) current.command({ id: person.id, label: person.name });
            return true;
          }
          if (event.key === 'Escape') return true;
          return false;
        },
        onExit() {
          unmount?.();
          root = null;
          current = null;
        },
      };
    },
  };
}
