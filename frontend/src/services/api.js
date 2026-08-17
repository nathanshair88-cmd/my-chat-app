import axios from 'axios';

const API = axios.create({
  baseURL: '/api',
});

// Interceptor to add JWT token
API.interceptors.request.use((config) => {
  const token = localStorage.getItem('discoalto_token');
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
  getSettings: () => API.get('/auth/settings'),
  saveSettings: (settings) => API.put('/auth/settings', { settings }),
};

export const serverAPI = {
  getServers: () => API.get('/servers'),
  getServer: (id) => API.get(`/servers/${id}`),
  createServer: (data) => API.post('/servers', data),
  updateServer: (id, data) => API.put(`/servers/${id}`, data),
  deleteServer: (id) => API.delete(`/servers/${id}`),
  removeMember: (server_id, user_id) => API.delete(`/servers/${server_id}/members/${user_id}`),
  joinServer: (invite_code) => API.post('/servers/join', { invite_code }),
  createChannel: (server_id, data) => API.post(`/servers/${server_id}/channels`, data),
};

export const channelAPI = {
  createChannel: (serverId, data) => API.post(`/servers/${serverId}/channels`, data),
  getMessages: (channelId) => API.get(`/channels/${channelId}/messages`),
  getThreadMessages: (channelId, messageId) => API.get(`/channels/${channelId}/messages/${messageId}/thread`),
};

export const dmAPI = {
  getConversations: () => API.get('/dms'),
  startConversation: (target) => API.post('/dms/start', null, { params: target }),
  getDMMessages: (conversation_id) => API.get(`/dms/${conversation_id}/messages`),
  searchUsers: (q) => API.get('/dms/users/search', { params: { q } }),
};

export const friendsAPI = {
  getFriends: () => API.get('/friends/'),
  sendRequest: (username) => API.post('/friends/request', { username }),
  acceptRequest: (id) => API.put(`/friends/${id}/accept`),
  removeFriend: (id) => API.delete(`/friends/${id}`),
};

export const roleAPI = {
  getRoles: (server_id) => API.get(`/servers/${server_id}/roles`),
  createRole: (server_id, data) => API.post(`/servers/${server_id}/roles`, data),
  updateRole: (server_id, role_id, data) => API.put(`/servers/${server_id}/roles/${role_id}`, data),
  deleteRole: (server_id, role_id) => API.delete(`/servers/${server_id}/roles/${role_id}`),
  assignRole: (server_id, user_id, role_id) => API.post(`/servers/${server_id}/members/${user_id}/role`, { role_id }),
};

export const webhookAPI = {
  getWebhooks: (server_id) => API.get(`/servers/${server_id}/webhooks`),
  createWebhook: (server_id, data) => API.post(`/servers/${server_id}/webhooks`, data),
  deleteWebhook: (server_id, webhook_id) => API.delete(`/servers/${server_id}/webhooks/${webhook_id}`),
};

export default API;
