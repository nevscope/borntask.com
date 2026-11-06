import { useQuery } from '@tanstack/react-query';
import { BASE_URL } from '../api/http';
import { useMe } from '../api/queries';
import { NoAccess } from '../components/NoAccess';
import { PageHeading } from '../components/PageHeading';
import { SettingsFrame } from '../components/SettingsNav';
import { color, font } from '../theme/tokens';

export function AdminBillingScreen() {
  const me = useMe().data;
  const canAdmin = me?.workspaceRole === 'owner' || me?.workspaceRole === 'admin';
  const canSeePeople = me?.workspaceRole !== 'guest' && me?.workspaceRole !== 'viewer';
  const billing = useQuery({
    queryKey: ['billing'],
    enabled: canAdmin,
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/billing`, { credentials: 'include' });
      if (!res.ok) throw new Error('You cannot open billing.');
      return (await res.json()) as { paid: number; guests: number };
    },
  });
  const paid = billing.data?.paid ?? 0;
  const guests = billing.data?.guests ?? 0;

  return (
    <SettingsFrame canAdmin={canAdmin} isOwner={me?.workspaceRole === 'owner'} canSeePeople={canSeePeople}>
      {me && !canAdmin ? (
        <NoAccess kind="settings" message="Only a workspace owner or admin can open billing." />
      ) : (
        <>
      <PageHeading hideOnPhone={false}>Billing</PageHeading>
      <p style={{ color: color.muted, margin: '6px 0 0' }}>Visible to workspace owners and admins. Card collection is not connected yet.</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'stretch' }}>
        <section className="bt-card" style={{ flex: '1.2 1 380px', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontWeight: 600, fontSize: 15 }}>BornTask</span>
            <span style={{ fontSize: 12, fontWeight: 600, padding: '2px 9px', borderRadius: 999, background: color.brandTint, color: color.brandStrong }}>Active</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontFamily: font.display, fontSize: 34, fontWeight: 600 }}>€1</span>
            <span style={{ fontSize: 14, color: color.ink3 }}>per member per month, billed monthly</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
            <Stat n={String(paid)} label="paid members" />
            <Stat n={String(guests)} label="guests, free" />
            <Stat n={`€${paid.toFixed(2)}`} label="per month + VAT" />
          </div>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: color.ink3 }}>
            Owners, admins, members and viewers count as members. Guests are free. People added mid-month are charged for the days left; people removed are credited on the next invoice.
          </p>
        </section>
        <section className="bt-card" style={{ flex: '1 1 300px', padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <span style={{ fontWeight: 600, fontSize: 15 }}>Next invoice</span>
          <span style={{ fontFamily: font.display, fontSize: 26, fontWeight: 600 }}>€{paid.toFixed(2)} <span style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 400, color: color.muted }}>+ VAT</span></span>
          <span style={{ fontSize: 13.5, color: color.ink3 }}>{paid} members × €1</span>
          <div style={{ height: 1, background: color.divider }} />
          <p style={{ margin: 0, fontSize: 13, color: color.muted }}>A payment card is not on file. Seat counts above are live; invoicing ships with the billing provider.</p>
        </section>
      </div>
        </>
      )}
    </SettingsFrame>
  );
}

function Stat({ n, label }: { n: string; label: string }) {
  return (
    <div style={{ padding: 12, borderRadius: 10, background: color.canvas }}>
      <span style={{ display: 'block', fontFamily: font.display, fontSize: 22, fontWeight: 600 }}>{n}</span>
      <span style={{ fontSize: 12.5, color: color.ink3 }}>{label}</span>
    </div>
  );
}
