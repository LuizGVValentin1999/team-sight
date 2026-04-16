'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export type ProtectedSessionUser = {
  id: string;
  name: string;
  email: string;
  role: string;
};

type UseProtectedSessionOptions = {
  apiUrl: string;
  redirectTo?: string;
  onInvalidSessionMessage?: (message: string) => void;
};

function clearStoredSession() {
  localStorage.removeItem('teamsight_token');
  localStorage.removeItem('teamsight_user_name');
}

export function useProtectedSession({
  apiUrl,
  redirectTo = '/login',
  onInvalidSessionMessage
}: UseProtectedSessionOptions) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [sessionChecking, setSessionChecking] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<ProtectedSessionUser | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const invalidateSession = useCallback(
    (message?: string) => {
      clearStoredSession();
      setToken(null);
      setCurrentUser(null);

      if (message) {
        onInvalidSessionMessage?.(message);
      }

      router.replace(redirectTo);
    },
    [onInvalidSessionMessage, redirectTo, router]
  );

  useEffect(() => {
    if (!mounted) {
      return;
    }

    let cancelled = false;

    const bootstrapSession = async () => {
      const storedToken = localStorage.getItem('teamsight_token');

      if (!storedToken) {
        if (!cancelled) {
          setSessionChecking(false);
        }

        router.replace(redirectTo);
        return;
      }

      try {
        const response = await fetch(`${apiUrl}/auth/me`, {
          headers: {
            Authorization: `Bearer ${storedToken}`
          }
        });

        const data = (await response.json()) as {
          user?: ProtectedSessionUser;
          message?: string;
        };

        if (!response.ok || !data.user) {
          throw new Error(data.message ?? 'Sessão inválida, faça login novamente.');
        }

        localStorage.setItem('teamsight_user_name', data.user.name);

        if (!cancelled) {
          setCurrentUser(data.user);
          setToken(storedToken);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Sessão inválida, faça login novamente.';

        if (!cancelled) {
          invalidateSession(errorMessage);
        } else {
          clearStoredSession();
        }
      } finally {
        if (!cancelled) {
          setSessionChecking(false);
        }
      }
    };

    void bootstrapSession();

    return () => {
      cancelled = true;
    };
  }, [apiUrl, invalidateSession, mounted, redirectTo, router]);

  return {
    mounted,
    sessionChecking,
    token,
    currentUser,
    invalidateSession
  };
}
