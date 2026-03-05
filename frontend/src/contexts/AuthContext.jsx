import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [workspaces, setWorkspaces] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Handle Google OAuth callback — token arrives as URL query param
    const params = new URLSearchParams(window.location.search);
    const oauthToken = params.get('token');
    if (oauthToken) {
      localStorage.setItem('hive_token', oauthToken);
      window.history.replaceState({}, '', window.location.pathname);
    }

    const token = localStorage.getItem('hive_token');
    if (token) {
      api.get('/auth/me')
        .then(({ data }) => {
          setUser(data.user);
          setWorkspaces(data.workspaces);
        })
        .catch(() => {
          localStorage.removeItem('hive_token');
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('hive_token', data.token);
    setUser(data.user);
    setWorkspaces(data.workspaces);
    return data;
  }, []);

  const register = useCallback(async (email, password, display_name, workspace_name) => {
    const { data } = await api.post('/auth/register', { email, password, display_name, workspace_name });
    localStorage.setItem('hive_token', data.token);
    setUser(data.user);
    setWorkspaces(data.workspaces);
    return data;
  }, []);

  const registerWithInvite = useCallback(async (email, password, display_name, invite_code) => {
    const { data } = await api.post('/auth/register-with-invite', { email, password, display_name, invite_code });
    localStorage.setItem('hive_token', data.token);
    setUser(data.user);
    setWorkspaces(data.workspaces);
    return data;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('hive_token');
    localStorage.removeItem('hive_workspace');
    setUser(null);
    setWorkspaces([]);
  }, []);

  const updateProfile = useCallback(async (updates) => {
    const { data } = await api.patch('/auth/me', updates);
    setUser(data.user);
    return data;
  }, []);

  const uploadAvatar = useCallback(async (file) => {
    const formData = new FormData();
    formData.append('avatar', file);
    const { data } = await api.post('/auth/me/avatar', formData);
    setUser(data.user);
    return data.user;
  }, []);

  const addWorkspace = useCallback((workspace) => {
    setWorkspaces(prev => {
      if (prev.find(w => w.id === workspace.id)) return prev;
      return [...prev, workspace];
    });
  }, []);

  return (
    <AuthContext.Provider value={{
      user, setUser, workspaces, setWorkspaces,
      loading, login, register, registerWithInvite,
      logout, updateProfile, uploadAvatar, addWorkspace,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
