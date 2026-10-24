import { useInviteToProject, useMe, usePeople } from '../api/queries';
import type { User } from '../api/types';
import { inviteSentText, useStatusToast } from './StatusToast';

export function useMentionInvite(project: { id?: string; key?: string } | undefined, people: User[]) {
  const me = useMe().data;
  const workspacePeople = usePeople();
  const toast = useStatusToast();
  const invite = useInviteToProject(project?.id, project?.key ?? '');
  const onProject = new Set(people.map((person) => person.id));
  const canInvite = Boolean(project?.id && me && me.workspaceRole !== 'guest' && me.workspaceRole !== 'viewer');
  const invitePeople = canInvite
    ? (workspacePeople.data ?? []).filter((person) => !onProject.has(person.id))
    : [];

  return {
    invitePeople,
    canInvite,
    onInvite: canInvite
      ? async (target: { email: string; person?: User }) => {
        try {
          const sent = await invite.mutateAsync({ email: target.email });
          toast.show(target.person
            ? `Added ${target.person.name} to this project.`
            : inviteSentText(sent));
          return true;
        } catch (err) {
          toast.show({ kind: 'error', text: err instanceof Error ? err.message : 'Could not send the invitation.' });
          return false;
        }
      }
      : undefined,
  };
}
