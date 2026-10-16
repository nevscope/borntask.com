import { BASE_URL } from '../api/http';
import type { AttachmentItem } from '../components/AttachmentTiles';

export async function uploadPendingFile(file: File): Promise<AttachmentItem> {
  const body = new FormData();
  body.append('file', file, file.name);
  const res = await fetch(`${BASE_URL}/uploads`, { method: 'POST', credentials: 'include', body });
  const json = (await res.json().catch(() => ({}))) as { id?: string; name?: string; size?: number; mime?: string; message?: string };
  if (!res.ok || !json.id) throw new Error(json.message ?? 'Could not upload that file.');
  return {
    id: json.id,
    name: json.name ?? file.name,
    size: json.size ?? file.size,
    mime: json.mime ?? file.type,
    previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
    progress: 100,
  };
}

export async function uploadTaskFile(taskKey: string, file: File): Promise<AttachmentItem> {
  const body = new FormData();
  body.append('file', file, file.name);
  const res = await fetch(`${BASE_URL}/tasks/${encodeURIComponent(taskKey)}/attachments`, {
    method: 'POST',
    credentials: 'include',
    body,
  });
  const json = (await res.json().catch(() => ({}))) as {
    id?: string;
    name?: string;
    size?: number;
    mime?: string;
    url?: string;
    message?: string;
  };
  if (!res.ok || !json.id) throw new Error(json.message ?? 'Could not attach that file.');
  return {
    id: json.id,
    name: json.name ?? file.name,
    size: json.size ?? file.size,
    mime: json.mime ?? file.type,
    previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
    progress: 100,
  };
}

export async function deleteTaskFile(taskKey: string, id: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/tasks/${encodeURIComponent(taskKey)}/attachments/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Could not remove that file.');
}

export async function downloadTaskFile(taskKey: string, id: string, name: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/tasks/${encodeURIComponent(taskKey)}/attachments/${encodeURIComponent(id)}`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Could not download that file.');
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  a.click();
  URL.revokeObjectURL(href);
}
