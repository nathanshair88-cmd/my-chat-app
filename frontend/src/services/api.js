import axios from 'axios';

const API = axios.create({
  baseURL: '/api',
});

// Interceptor to add JWT token
API.interceptors.request.use((config) => {
  const token = localStorage.getItem('discord_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const authAPI = {
  register: (data) => API.post('/auth/register', data),
  login: (data) => API.post('/auth/login', data),
  getMe: () => API.get('/auth/me'),
  updateStatus: (data) => API.put('/auth/status', data),
  updateProfile: (data) => API.put('/auth/profile', data),
};

export const serverAPI = {
  getServers: () => API.get('/servers'),
  getServer: (id) => API.get(`/servers/${id}`),
  createServer: (data) => API.post('/servers', data),
  joinServer: (invite_code) => API.post('/servers/join', { invite_code }),
  createChannel: (server_id, data) => API.post(`/servers/${server_id}/channels`, data),
};

export const channelAPI = {
  getMessages: (channel_id) => API.get(`/channels/${channel_id}/messages`),
};

export const dmAPI = {
  getConversations: () => API.get('/dms'),
  startConversation: (target) => API.post('/dms/start', null, { params: target }),
  getDMMessages: (conversation_id) => API.get(`/dms/${conversation_id}/messages`),
  searchUsers: (q) => API.get('/dms/users/search', { params: { q } }),
};

export default API;

