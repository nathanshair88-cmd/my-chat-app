import { io } from 'socket.io-client';

let socket = null;

const shouldUseVercelProxy = () =>
  typeof window !== 'undefined' &&
  window.location.hostname.endsWith('.vercel.app') &&
  import.meta.env.VITE_FORCE_DIRECT_BACKEND !== 'true';

const DEFAULT_RENDER_SOCKET_URL = 'https://my-chat-backend-suva.onrender.com';

export const initSocket = (token) => {
  if (socket) {
    socket.disconnect();
  }

  const socketUrl = shouldUseVercelProxy()
    ? DEFAULT_RENDER_SOCKET_URL
    : (import.meta.env.VITE_SOCKET_URL || window.location.origin);

  socket = io(socketUrl, {
    auth: { token },
    query: { token }
  });

  return socket;
};

export const getSocket = () => socket;

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};
