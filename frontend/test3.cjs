const axios = require('axios');
const { io } = require('socket.io-client');

async function test() {
  try {
    const res = await axios.post('http://127.0.0.1:8000/api/auth/register', {
      username: 'tester_' + Date.now(),
      email: 'test' + Date.now() + '@test.com',
      password: 'password123'
    });
    const token = res.data.access_token;
    
    // Create a server
    const serverRes = await axios.post('http://127.0.0.1:8000/api/servers', {
      name: 'Test Server',
      icon_url: ''
    }, { headers: { Authorization: 'Bearer ' + token } });
    const server_id = serverRes.data.id;
    
    // Get channels
    const serverDetails = await axios.get('http://127.0.0.1:8000/api/servers/' + server_id, {
      headers: { Authorization: 'Bearer ' + token }
    });
    const channel_id = serverDetails.data.channels[0].id;
    console.log('Got channel_id:', channel_id);

    const socket = io('http://127.0.0.1:8000', {
      auth: { token },
      query: { token },
      transports: ['websocket', 'polling']
    });

    socket.on('connect', () => {
      console.log('Socket connected!', socket.id);
      socket.emit('join_channel', { channel_id });
      setTimeout(() => {
        socket.emit('send_message', { channel_id, content: 'Hello from Node!' });
      }, 1000);
    });

    socket.on('new_message', (data) => {
      console.log('Received new_message:', data);
      process.exit(0);
    });
  } catch (err) {
    console.error('REST API error:', err.response ? err.response.data : err.message);
    process.exit(1);
  }
}
test();
