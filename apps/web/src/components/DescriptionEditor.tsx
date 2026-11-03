import { Image } from '@tiptap/extension-image';
import Mention from '@tiptap/extension-mention';
import Placeholder from '@tiptap/extension-placeholder';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion';
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { User } from '../api/types';
import { discardEditorHtmlOnBlur, mentionSearchHref, persistDescription, toEditorHtml } from '../lib/descriptionHtml';
import { color, font, radius } from '../theme/tokens';
import { filesFromClipboard } from './AttachmentTiles';

export type MentionInviteTarget = { email: string; person?: User };

export type EmbeddedImage = { id: string; name: string; src: string };

const TaskImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      attachmentId: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-attachment-id'),
        renderHTML: (attributes: { attachmentId?: string | null }) => (
          attributes.attachmentId ? { 'data-attachment-id': attributes.attachmentId } : {}
        ),
      },
    };
  },
});

const TaskMention = Mention.extend({
  parseHTML() {
    return [
      { tag: 'span[data-type="mention"]' },
      { tag: 'a[data-type="mention"]' },
    ];
  },
});

interface Props {
  value: string;
  onChange: (html: string) => void;
  onBlur?: (html: string) => void;
  onFocusChange?: (focused: boolean) => void;
  people?: User[];
  invitePeople?: User[];
  canInvite?: boolean;
  onInvite?: (target: MentionInviteTarget) => Promise<boolean>;
  placeholder?: string;
  minHeight?: number;
  compact?: boolean;
  showPasteHint?: boolean;
  ariaLabel?: string;
  onEditorKeyDown?: (event: KeyboardEvent) => void;
  onPasteFiles?: (files: File[]) => void | EmbeddedImage[] | Promise<void | EmbeddedImage[] | undefined>;
  /** Paste and the Image button insert the uploaded picture into this field. */
  embedImages?: boolean;
  onOpenImage?: (id: string) => void;
}

export function DescriptionEditor({
  value,
  onChange,
  onBlur,
  onFocusChange,
  people = [],
  invitePeople = [],
  canInvite = false,
  onInvite,
  placeholder = 'Add details.',
  minHeight = 140,
  compact = false,
  showPasteHint = true,
  ariaLabel = 'Description',
  onEditorKeyDown,
  onPasteFiles,
  embedImages = false,
  onOpenImage,
}: Props) {
  const peopleRef = useRef(people);
  peopleRef.current = people;
  const invitePeopleRef = useRef(invitePeople);
  invitePeopleRef.current = invitePeople;
  const canInviteRef = useRef(canInvite);
  canInviteRef.current = canInvite;
  const onInviteRef = useRef(onInvite);
  onInviteRef.current = onInvite;
  const focusCb = useRef(onFocusChange);
  focusCb.current = onFocusChange;
  const pasteFiles = useRef(onPasteFiles);
  pasteFiles.current = onPasteFiles;
  const embedImagesRef = useRef(embedImages);
  embedImagesRef.current = embedImages;
  const openImageRef = useRef(onOpenImage);
  openImageRef.current = onOpenImage;
  const editorRef = useRef<Editor | null>(null);
  const afterPaste = useRef<(files: File[]) => void>(() => {});
  const keyDown = useRef(onEditorKeyDown);
  keyDown.current = onEditorKeyDown;
  const applying = useRef(false);
  const valueRef = useRef(value);
  valueRef.current = value;
  const acknowledged = useRef(persistDescription(value));
  const shown = persistDescription(value);
  if (shown) acknowledged.current = shown;
  const suggestionOpen = useRef(false);
  const mentionUiOpen = useRef(false);
  const [focused, setFocused] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  mentionUiOpen.current = mentionOpen;
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

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
          openOnClick: true,
          autolink: true,
          HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
        },
      }),
      TaskImage.configure({ inline: false, allowBase64: false }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({ placeholder }),
      TaskMention.configure({
        HTMLAttributes: { class: 'bt-mention' },
        suggestion: mentionSuggestion(peopleRef, invitePeopleRef, canInviteRef, onInviteRef, suggestionOpen),
      }),
    ],
    content: toEditorHtml(value),
    editorProps: {
      attributes: {
        'aria-label': ariaLabel,
        class: compact ? 'bt-desc-surface bt-desc-compact' : 'bt-desc-surface',
      },
      handleKeyDown(_view, event) {
        const mentionBusy = suggestionOpen.current || mentionUiOpen.current;
        if (event.key === 'Enter' && !event.shiftKey && mentionBusy) {
          return mentionUiOpen.current;
        }
        keyDown.current?.(event as unknown as KeyboardEvent);
        return event.defaultPrevented;
      },
      handlePaste(_view, event) {
        const files = filesFromClipboard(event.clipboardData);
        if (!files.length || !pasteFiles.current) return false;
        event.preventDefault();
        event.stopPropagation();
        afterPaste.current(files);
        return true;
      },
      handleClick(_view, _pos, event) {
        const target = event.target as HTMLElement | null;
        const image = target?.closest?.('img');
        if (image instanceof HTMLImageElement) {
          const id = image.getAttribute('data-attachment-id');
          if (id && openImageRef.current) {
            event.preventDefault();
            openImageRef.current(id);
            return true;
          }
        }
        const mention = target?.closest?.('[data-type="mention"]');
        if (mention instanceof HTMLElement) {
          const label = mention.getAttribute('data-label') || mention.textContent?.replace(/^@/, '').trim() || '';
          if (!label) return false;
          event.preventDefault();
          navigateRef.current(mentionSearchHref(label));
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: next }) => {
      if (applying.current) return;
      onChange(persistDescription(next.getHTML()));
    },
    onFocus: () => {
      setFocused(true);
      focusCb.current?.(true);
    },
    onBlur: ({ editor: next }) => {
      setFocused(false);
      focusCb.current?.(false);
      if (applying.current) return;
      const html = persistDescription(next.getHTML());
      if (discardEditorHtmlOnBlur(valueRef.current, acknowledged.current, html)) {
        applying.current = true;
        next.commands.setContent('', { emitUpdate: false });
        applying.current = false;
        return;
      }
      onChange(html);
      onBlur?.(html);
    },
  });

  editorRef.current = editor;
  afterPaste.current = (files) => {
    const result = pasteFiles.current?.(files);
    if (!embedImagesRef.current) return;
    void Promise.resolve(result).then((images) => {
      const ed = editorRef.current;
      if (!ed || ed.isDestroyed || !Array.isArray(images) || !images.length) return;
      ed.chain().focus().insertContent(images.map((image) => ({
        type: 'image',
        attrs: { src: image.src, alt: image.name, attachmentId: image.id },
      }))).run();
    });
  };

  useEffect(() => {
    if (!editor) return;
    const next = toEditorHtml(value);
    const current = persistDescription(editor.getHTML());
    if (current === persistDescription(next)) return;
    // Empty the editor even while focused so a sent comment cannot linger and block close.
    if (focused && persistDescription(next)) return;
    applying.current = true;
    editor.commands.setContent(next || '', { emitUpdate: false });
    applying.current = false;
  }, [editor, value, focused]);

  useEffect(() => {
    if (!mentionOpen) return;
    const pickerId = `bt-mention-picker-${ariaLabel.replace(/\s+/g, '-')}`;
    const close = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && !document.getElementById(pickerId)?.contains(target) && !(target as HTMLElement).closest?.('[aria-label="Mention someone"]')) {
        setMentionOpen(false);
      }
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMentionOpen(false);
        return;
      }
      if (event.key !== 'Enter' || event.shiftKey) return;
      const choice = mentionChoices('', peopleRef.current, invitePeopleRef.current, canInviteRef.current)[0];
      if (!choice || !editor) return;
      event.preventDefault();
      event.stopPropagation();
      void (async () => {
        if (choice.kind === 'invite') {
          const ok = await onInviteRef.current?.({ email: choice.email, person: choice.person });
          if (!ok) return;
        }
        editor.chain().focus().insertContent({ type: 'mention', attrs: { id: choice.id, label: choice.label } }).insertContent('\u00a0').run();
        setMentionOpen(false);
      })();
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [mentionOpen, ariaLabel, editor]);

  return (
    <div style={{ position: 'relative' }}>
      <Toolbar
        editor={editor}
        focused={focused}
        mentionOpen={mentionOpen}
        people={people}
        invitePeople={invitePeople}
        canInvite={canInvite}
        showPasteHint={showPasteHint}
        pickerId={`bt-mention-picker-${ariaLabel.replace(/\s+/g, '-')}`}
        embedImages={embedImages}
        onAddImages={(files) => afterPaste.current(files)}
        onMention={() => {
          if (!editor) return;
          editor.chain().focus().run();
          setMentionOpen((open) => !open);
        }}
        onPickMention={async (choice) => {
          if (!editor) return;
          if (choice.kind === 'invite') {
            const ok = await onInvite?.({ email: choice.email, person: choice.person });
            if (!ok) return;
          }
          editor.chain().focus().insertContent({ type: 'mention', attrs: { id: choice.id, label: choice.label } }).insertContent('\u00a0').run();
          setMentionOpen(false);
        }}
      />
      <div
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

function wide(label: string): boolean {
  return label === 'Link' || label === 'Table' || label === 'Image';
}

function toolLabel(label: string): string {
  if (label === 'Bold') return 'B';
  if (label === 'Italic') return 'I';
  if (label === 'Numbered list') return '1.';
  if (label === 'Bulleted list') return '•';
  if (label === 'Code') return '</>';
  if (label === 'Link' || label === 'Table' || label === 'Image') return label;
  return '@';
}

function Toolbar({
  editor,
  focused,
  mentionOpen,
  people,
  invitePeople,
  canInvite,
  showPasteHint,
  pickerId,
  embedImages,
  onAddImages,
  onMention,
  onPickMention,
}: {
  editor: Editor | null;
  focused: boolean;
  mentionOpen: boolean;
  people: User[];
  invitePeople: User[];
  canInvite: boolean;
  showPasteHint: boolean;
  pickerId: string;
  embedImages: boolean;
  onAddImages: (files: File[]) => void;
  onMention: () => void;
  onPickMention: (choice: MentionChoice) => void;
}) {
  const imageInput = useRef<HTMLInputElement>(null);
  const tool = (label: string, active: boolean, run: () => void, style?: CSSProperties) => (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onMouseDown={(event) => event.preventDefault()}
      onClick={run}
      style={{
        width: wide(label) ? 'auto' : 32,
        height: 30,
        padding: wide(label) ? '0 8px' : 0,
        border: 0,
        borderRadius: 6,
        background: active ? color.brandTint : 'transparent',
        font: 'inherit',
        fontSize: wide(label) ? 12 : undefined,
        cursor: 'pointer',
        color: color.ink,
        ...style,
      }}
    >
      {toolLabel(label)}
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

  function insertTable() {
    editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
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
      {tool('Table', !!editor?.isActive('table'), insertTable)}
      {embedImages && tool('Image', false, () => imageInput.current?.click())}
      {tool('Mention someone', mentionOpen, onMention)}
      {embedImages && (
        <input
          ref={imageInput}
          type="file"
          accept="image/*"
          multiple
          className="bt-sr-only"
          onChange={(event) => {
            const list = event.target.files;
            if (list?.length) onAddImages(Array.from(list));
            event.target.value = '';
          }}
        />
      )}
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
          {mentionChoices('', people, invitePeople, canInvite).length === 0 ? (
            <div style={{ padding: '8px 10px', fontSize: 13, color: color.muted }}>
              {canInvite ? 'No people on this project yet. Type @ and their email to invite them.' : 'No people on this project yet.'}
            </div>
          ) : (
            mentionChoices('', people, invitePeople, canInvite).map((choice) => (
              <button
                key={`${choice.kind}-${choice.id}`}
                type="button"
                role="option"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onPickMention(choice)}
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
                {choice.title}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

type MentionChoice = {
  kind: 'mention' | 'invite';
  id: string;
  label: string;
  email: string;
  person?: User;
  title: string;
};

function looksLikeEmail(raw: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.trim());
}

function mentionChoices(query: string, people: User[], invitePeople: User[], canInvite: boolean): MentionChoice[] {
  const q = query.trim().toLowerCase();
  const match = (person: User) => !q || person.name.toLowerCase().includes(q) || person.email.toLowerCase().includes(q);
  const members = people.filter(match).slice(0, 8).map((person) => ({
    kind: 'mention' as const,
    id: person.id,
    label: person.name,
    email: person.email,
    person,
    title: person.name,
  }));
  const taken = new Set(members.map((row) => row.email.toLowerCase()));
  const invites = canInvite
    ? invitePeople
      .filter((person) => match(person) && !taken.has(person.email.toLowerCase()))
      .slice(0, 5)
      .map((person) => ({
        kind: 'invite' as const,
        id: person.id,
        label: person.name,
        email: person.email,
        person,
        title: `Invite ${person.name} to this project`,
      }))
    : [];
  const rows: MentionChoice[] = [...members, ...invites];
  if (canInvite && looksLikeEmail(q) && !rows.some((row) => row.email.toLowerCase() === q)) {
    rows.push({
      kind: 'invite',
      id: q,
      label: q,
      email: q,
      title: `Invite ${q} to this project`,
    });
  }
  return rows.slice(0, 8);
}

function emptyMentionCopy(query: string, people: User[], canInvite: boolean) {
  const q = query.trim();
  if (canInvite && q.includes('@') && !looksLikeEmail(q)) return 'Finish the email address to invite them.';
  if (canInvite && q) return 'No matching people. Type their email to invite them to this project.';
  return people.length ? 'No matching people' : 'Type @ then a name when the project has people';
}

function mentionSuggestion(
  peopleRef: { current: User[] },
  invitePeopleRef: { current: User[] },
  canInviteRef: { current: boolean },
  onInviteRef: { current: ((target: MentionInviteTarget) => Promise<boolean>) | undefined },
  openRef: { current: boolean },
) {
  return {
    items: ({ query }: { query: string }) =>
      mentionChoices(query, peopleRef.current, invitePeopleRef.current, canInviteRef.current),
    render: () => {
      let root: HTMLDivElement | null = null;
      let unmount: (() => void) | undefined;
      let selected = 0;
      let current: SuggestionProps<MentionChoice> | null = null;

      function paint(props: SuggestionProps<MentionChoice>) {
        current = props;
        if (!root) return;
        root.replaceChildren();
        if (!props.items.length) {
          const empty = document.createElement('div');
          empty.textContent = emptyMentionCopy(props.query, peopleRef.current, canInviteRef.current);
          empty.style.cssText = `padding:8px 10px;font-size:13px;color:${color.muted}`;
          root.appendChild(empty);
          return;
        }
        props.items.forEach((choice, index) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.setAttribute('role', 'option');
          btn.textContent = choice.title;
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
            void applyMention(choice, props);
          };
          root!.appendChild(btn);
        });
      }

      async function applyMention(choice: MentionChoice, props: SuggestionProps<MentionChoice>) {
        if (choice.kind === 'invite') {
          const ok = await onInviteRef.current?.({ email: choice.email, person: choice.person });
          if (!ok) return;
        }
        props.command({ id: choice.id, label: choice.label });
      }

      return {
        onStart(props: SuggestionProps<MentionChoice>) {
          selected = 0;
          openRef.current = true;
          root = document.createElement('div');
          root.setAttribute('role', 'listbox');
          root.style.cssText = [
            `z-index:2000`,
            `min-width:220px`,
            `padding:4px`,
            `border:1px solid ${color.border}`,
            `border-radius:${radius.md}px`,
            `background:${color.surface}`,
          ].join(';');
          unmount = props.mount(root);
          paint(props);
        },
        onUpdate(props: SuggestionProps<MentionChoice>) {
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
            const choice = current.items[selected];
            if (choice) void applyMention(choice, current);
            return true;
          }
          if (event.key === 'Escape') return true;
          return false;
        },
        onExit() {
          openRef.current = false;
          unmount?.();
          root = null;
          current = null;
        },
      };
    },
  };
}
