import { App, Button, Form, Input, Modal, Select } from 'antd';
import { useState } from 'react';
import { BASE_URL } from '../api/http';

export function InvitePeopleButton({ projectId, projectName }: { projectId?: string; projectName?: string }) {
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <>
      <Button
        shape="circle"
        aria-label={`Invite people${projectName ? ` to ${projectName}` : ''}`}
        title="Invite people"
        style={{ marginLeft: 6, borderStyle: 'dashed' }}
        onClick={() => setOpen(true)}
      >
        +
      </Button>
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
              const json = await res.json() as { message?: string; invites?: { email: string; url: string }[] };
              if (!res.ok) throw new Error(json.message ?? 'Invite failed');
              json.invites?.forEach((i) => console.log(`[BornTask] Invite for ${i.email}: ${i.url}`));
              void message.success('Invites created. URLs are in the API console while email is off.');
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
          <Form.Item name="tenantRole" label="Workspace role" initialValue="member">
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
