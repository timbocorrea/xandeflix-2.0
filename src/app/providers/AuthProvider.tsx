import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { spatialError } from '@/lib/spatial/spatialDebug';

import {
  clearSupabaseLocalAuthStorage,
  supabase,
} from '../../lib/supabase/supabaseClient';
import { clearClientRuntimeAccessState } from '../../features/bootstrap/services/appBootstrap.service';
import {
  clearClientAccessSignedOut,
  isClientAccessSignedOut,
  markClientAccessSignedOut,
} from '../../features/licensing/lib/licenseActivationStorage';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const authOperationGenerationRef = useRef(0);
  const isLocalSignOutRef = useRef(isClientAccessSignedOut());

  const refreshSession = useCallback(async () => {
    const authOperationGeneration = authOperationGenerationRef.current;

    if (isLocalSignOutRef.current || isClientAccessSignedOut()) {
      clearSupabaseLocalAuthStorage();
      setSession(null);
      setUser(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    const { data, error } = await supabase.auth.getSession();

    if (authOperationGenerationRef.current !== authOperationGeneration) {
      return;
    }

    if (isLocalSignOutRef.current || isClientAccessSignedOut()) {
      clearSupabaseLocalAuthStorage();
      setSession(null);
      setUser(null);
      setIsLoading(false);
      return;
    }

    if (error) {
      spatialError('provider', '[AuthProvider] Erro ao buscar sessão:', error.message);
      setSession(null);
      setUser(null);
      setIsLoading(false);
      return;
    }

    setSession(data.session);
    setUser(data.session?.user ?? null);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void refreshSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      if (
        currentSession &&
        (isLocalSignOutRef.current || isClientAccessSignedOut())
      ) {
        clearSupabaseLocalAuthStorage();
        setSession(null);
        setUser(null);
        setIsLoading(false);
        return;
      }

      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      setIsLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [refreshSession]);

  const signIn = useCallback(async (email: string, password: string) => {
    authOperationGenerationRef.current += 1;
    isLocalSignOutRef.current = false;
    clearClientAccessSignedOut();
    setIsLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setIsLoading(false);

    if (error) {
      throw new Error(error.message);
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    authOperationGenerationRef.current += 1;
    isLocalSignOutRef.current = false;
    clearClientAccessSignedOut();
    setIsLoading(true);

    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    setIsLoading(false);

    if (error) {
      throw new Error(error.message);
    }
  }, []);

  const signOut = useCallback((): Promise<void> => {
    authOperationGenerationRef.current += 1;
    isLocalSignOutRef.current = true;
    markClientAccessSignedOut();

    try {
      void supabase.auth.signOut().catch(() => undefined);
    } catch {
      spatialError(
        'provider',
        '[AuthProvider] Falha ao iniciar logout remoto.',
      );
    }

    try {
      clearSupabaseLocalAuthStorage();
    } catch {
      spatialError(
        'provider',
        '[AuthProvider] Falha ao limpar sessão local.',
      );
    }

    try {
      clearClientRuntimeAccessState();
    } catch {
      spatialError(
        'provider',
        '[AuthProvider] Falha ao limpar acesso local.',
      );
    }

    setSession(null);
    setUser(null);
    setIsLoading(false);

    return Promise.resolve();
  }, []);
  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      isLoading,
      isAuthenticated: Boolean(user && session),
      signIn,
      signUp,
      signOut,
      refreshSession,
    }),
    [user, session, isLoading, signIn, signUp, signOut, refreshSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider');
  }

  return context;
}
