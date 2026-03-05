import { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { user } = useAuth();
  const [socket, setSocket] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState({});
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!user) {
      setSocket(prev => {
        if (prev) prev.disconnect();
        return null;
      });
      setConnected(false);
      return;
    }

    const token = localStorage.getItem('hive_token');
    if (!token) return;

    const newSocket = io(window.location.origin, {
      auth: { token },
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });

    newSocket.on('connect', () => setConnected(true));
    newSocket.on('disconnect', () => setConnected(false));
    newSocket.on('connect_error', (err) => console.error('[Hive] Socket error:', err.message));

    newSocket.on('presence:online_users', (users) => {
      const map = {};
      users.forEach(u => { map[u.user_id] = u.status; });
      setOnlineUsers(map);
    });

    newSocket.on('presence:update', ({ user_id, status }) => {
      setOnlineUsers(prev => ({ ...prev, [user_id]: status }));
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [user]);

  const emit = useCallback((event, data) => {
    if (socket?.connected) {
      socket.emit(event, data);
    }
  }, [socket]);

  const on = useCallback((event, callback) => {
    if (socket) {
      socket.on(event, callback);
      return () => socket.off(event, callback);
    }
    return () => {};
  }, [socket]);

  const off = useCallback((event, callback) => {
    if (socket) socket.off(event, callback);
  }, [socket]);

  return (
    <SocketContext.Provider value={{ socket, connected, onlineUsers, emit, on, off }}>
      {children}
    </SocketContext.Provider>
  );
}

export const useSocket = () => useContext(SocketContext);
