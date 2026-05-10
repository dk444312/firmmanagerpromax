import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

type User = {
  id: string;
  firm_id: string;
  name: string;
  username: string;
  role: string;
  accessible_menus: string[];
  case_access_mode: string;
  picture?: string;
  message_notifications?: boolean;
};

type AuthContextType = {
  user: User | null;
  token: string | null;
  uiConfig: Record<string, string>;
  updateUiConfig: (config: Record<string, string>) => void;
  login: (token: string, user: User) => void;
  logout: () => void;
  loading: boolean;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [uiConfig, setUiConfig] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      if (token.startsWith('frontend_only_')) {
        // Direct frontend auth mode
        try {
          const payloadString = atob(token.replace('frontend_only_', ''));
          const payload = JSON.parse(payloadString);
          
          if (supabase) {
            (async () => {
              try {
                const { data, error } = await supabase.from('staff').select('*').eq('id', payload.id).single();
                if (error || !data) {
                  logout();
                } else {
                  const { password_hash, ...userProfile } = data;
                  setUser(userProfile);
                  // grab UI config
                  const { data: firmData } = await supabase.from('firms').select('ui_config').eq('id', userProfile.firm_id).single();
                  if (firmData && firmData.ui_config) {
                    setUiConfig(firmData.ui_config);
                  }
                }
              } catch (e) {
                logout();
              } finally {
                setLoading(false);
              }
            })();
          } else {
            setLoading(false);
          }
        } catch (e) {
          logout();
          setLoading(false);
        }
      } else {
        Promise.all([
          fetch('/api/me', { headers: { 'Authorization': `Bearer ${token}` } }).then(res => res.json()),
          fetch('/api/ui_config', { headers: { 'Authorization': `Bearer ${token}` } }).then(res => res.json()).catch(() => ({}))
        ])
        .then(([userData, configData]) => {
          if (userData.error) {
            logout();
          } else {
            setUser(userData);
            if (!configData.error) setUiConfig(configData);
          }
        })
        .catch(() => logout())
        .finally(() => setLoading(false));
      }
    } else {
      setLoading(false);
    }
  }, [token]);

  const login = (newToken: string, newUser: User) => {
    localStorage.setItem('token', newToken);
    setToken(newToken);
    setUser(newUser);
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    setUiConfig({});
  };

  const updateUiConfig = (config: Record<string, string>) => {
    setUiConfig(config);
  };

  return (
    <AuthContext.Provider value={{ user, token, uiConfig, updateUiConfig, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
