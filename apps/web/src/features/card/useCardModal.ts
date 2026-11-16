import { useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

const PARAM = 'card';

/**
 * The open card lives in the URL (`?card=<id>`) so every card is deep-linkable and the
 * browser back button closes the modal.
 */
export function useCardModal() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const cardId = params.get(PARAM);

  const open = useCallback(
    (id: string) =>
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set(PARAM, id);
        return next;
      }),
    [setParams],
  );

  const close = useCallback(
    () =>
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete(PARAM);
        return next;
      }),
    [setParams],
  );

  /** Open a card that may live in another project (notifications, My Tasks). */
  const openInProject = useCallback(
    (projectId: string, id: string) => navigate(`/projects/${projectId}?${PARAM}=${id}`),
    [navigate],
  );

  return { cardId, open, close, openInProject };
}
