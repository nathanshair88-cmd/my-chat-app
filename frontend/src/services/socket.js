import { io } from 'socket.io-client';

let socket = null;

export const initSocket = (token) => {
  if (socket) {
    socket.disconnect();
  }

  const defaultSocketUrl = typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'
    ? 'https://my-chat-backend-suva.onrender.com'
    : window.location.origin;

  const socketUrl = import.meta.env.VITE_SOCKET_URL || defaultSocketUrl;

  socket = io(socketUrl, {
    auth: { token },
    query: { token },
    transports: ['websocket', 'polling'],
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
