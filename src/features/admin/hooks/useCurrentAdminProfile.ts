import { useEffect, useState } from 'react';

import { getCurrentAdminProfile } from '../services/adminAccess.service';
import type { AdminProfile } from '../types/admin.types';

type UseCurrentAdminProfileState = {
  adminProfile: AdminProfile | null;
  isLoading: boolean;
  error: string | null;
};

export function useCurrentAdminProfile(): UseCurrentAdminProfileState {
  const [adminProfile, setAdminProfile] = useState<AdminProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadCurrentAdminProfile() {
      setIsLoading(true);
      setError(null);

      try {
        const profile = await getCurrentAdminProfile();

        if (isMounted) {
          setAdminProfile(profile);
        }
      } catch (loadError) {
        if (isMounted) {
          setAdminProfile(null);
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Não foi possível carregar o perfil administrativo.',
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadCurrentAdminProfile();

    return () => {
      isMounted = false;
    };
  }, []);

  return {
    adminProfile,
    isLoading,
    error,
  };
}
