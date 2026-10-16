import { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';
import { ConfirmDialog } from '../components/ConfirmDialog';

export function useUnsavedChanges(dirty: boolean) {
  const blocker = useBlocker(dirty);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  return (
    <ConfirmDialog
      open={blocker.state === 'blocked'}
      title="Unsaved changes"
      cancelLabel="Stay"
      confirmLabel="Leave"
      onCancel={() => {
        if (blocker.state === 'blocked') blocker.reset();
      }}
      onConfirm={() => {
        if (blocker.state === 'blocked') blocker.proceed();
      }}
    >
      Leave this page? Your edits will be lost.
    </ConfirmDialog>
  );
}
