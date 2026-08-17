const axios = require('axios');
const { io } = require('socket.io-client');

async function test() {
  try {
    const res = await axios.post('https://my-chat-backend-suva.onrender.com/api/auth/login', {
      email: 'test1786913554051@test.com',
      password: 'password123'
    });
    const token = res.data.access_token;
    
    const socket = io('https://my-chat-backend-suva.onrender.com', {
      auth: { token },
      query: { token },
      transports: ['websocket', 'polling']
    });
    
    socket.on('connect', () => {
      console.log('Socket connected successfully, ID:', socket.id);
      
      // Join channel 7 (general for tester_1786913554051)
      socket.emit('join_channel', { channel_id: 7 });
      
      // Send message
      setTimeout(() => {
        socket.emit('send_message', {
          channel_id: 7,
          content: 'Hello World from Test'
        });
        console.log('Message sent');
      }, 1000);
    });
    
    socket.on('new_message', (msg) => {
      console.log('Received new_message:', msg.content);
      socket.disconnect();
    });

  } catch (err) {
    console.error('Error:', err);
  }
}
test();
