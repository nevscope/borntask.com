import { App, Button, Form, Input, Modal, Select } from 'antd';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BASE_URL } from '../api/http';
import { radius } from '../theme/tokens';

export function InvitePeopleButton({
  projectId,
  projectName,
  variant = 'icon',
}: {
  projectId?: string;
  projectName?: string;
  variant?: 'icon' | 'primary';
}) {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <>
      {variant === 'primary' ? (
        <Button type="primary" onClick={() => setOpen(true)} style={{ height: 38, padding: '0 14px', borderRadius: radius.md, fontSize: 13.5, fontWeight: 600 }}>
          Invite people
        </Button>
      ) : (
        <Button
          shape="circle"
          aria-label={`Invite people${projectName ? ` to ${projectName}` : ''}`}
          title="Invite people"
          style={{ marginLeft: 6, borderStyle: 'dashed' }}
          onClick={() => setOpen(true)}
        >
          +
        </Button>
      )}
      <Modal title="Invite people" open={open} onCancel={() => setOpen(false)} footer={null} destroyOnHidden>
        <Form
          layout="vertical"
          onFinish={async (v: { emails: string; tenantRole: 'member' | 'guest' | 'viewer'; message?: string }) => {
            setBusy(true);
            try {
              const res = await fetch(`${BASE_URL}/invites`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  emails: v.emails.split(/[,;\s]+/).filter(Boolean),
                  tenantRole: v.tenantRole,
                  projectId,
                  message: v.message,
                }),
              });
              const json = await res.json() as { message?: string; invites?: { email: string; url: string; tenantRole: string }[] };
              if (!res.ok) throw new Error(json.message ?? 'Invite failed');
              json.invites?.forEach((i) => console.log(`[BornTask] Invite for ${i.email}: ${i.url}`));
              void qc.invalidateQueries({ queryKey: ['invites'] });
              const guests = json.invites?.filter((i) => i.tenantRole === 'guest' && v.tenantRole !== 'guest') ?? [];
              void message.success(
                guests.length
                  ? 'Invites created. An external email is a guest. URLs are in the API console while email is off.'
                  : 'Invites created. URLs are in the API console while email is off.',
              );
              setOpen(false);
            } catch (e) {
              void message.error(e instanceof Error ? e.message : 'Invite failed');
            } finally {
              setBusy(false);
            }
          }}
        >
          <Form.Item name="emails" label="Email addresses" rules={[{ required: true }]}>
            <Input.TextArea rows={3} placeholder="alex@company.com, client@firm.com" />
          </Form.Item>
          <Form.Item name="tenantRole" label="Workspace role" initialValue="member" extra="An email outside this workspace's domain is invited as a guest.">
            <Select options={[
              { value: 'member', label: 'Member' },
              { value: 'guest', label: 'Guest (external email)' },
              { value: 'viewer', label: 'Viewer' },
            ]}
            />
          </Form.Item>
          <Form.Item name="message" label="Optional message">
            <Input />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={busy}>Send invites</Button>
        </Form>
      </Modal>
    </>
  );
}
