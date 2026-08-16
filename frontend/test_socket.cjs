const axios = require('axios');
const { io } = require('socket.io-client');

async function test() {
  try {
    const res = await axios.post('https://my-chat-backend-suva.onrender.com/api/auth/register', {
      username: 'testuser_' + Date.now(),
      email: 'test' + Date.now() + '@test.com',
      password: 'password123'
    });
    const token = res.data.access_token;
    console.log('Registered token:', token.substring(0, 10) + '...');

    const socket = io('https://my-chat-backend-suva.onrender.com', {
      auth: { token },
      query: { token },
      transports: ['websocket', 'polling']
    });

    socket.on('connect', () => {
      console.log('Socket connected!', socket.id);
      socket.emit('join_channel', { channel_id: 1 });
      setTimeout(() => {
        console.log('Sending message...');
        socket.emit('send_message', { channel_id: 1, content: 'Hello from Node!' });
      }, 1000);
    });

    socket.on('new_message', (data) => {
      console.log('Received new_message:', data);
      process.exit(0);
    });

    socket.on('connect_error', (err) => {
      console.error('Socket error:', err.message);
      process.exit(1);
    });
  } catch (err) {
    console.error('REST API error:', err.message);
    process.exit(1);
  }
}
test();
