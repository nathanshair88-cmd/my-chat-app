const axios = require('axios');

async function test() {
  try {
    const res = await axios.post('https://my-chat-backend-suva.onrender.com/api/auth/login', {
      email: 'nathans_hair@hotmail.com',
      password: 'password123'
    });
    const token = res.data.access_token;
    console.log('Logged in successfully');
    
    const meRes = await axios.get('https://my-chat-backend-suva.onrender.com/api/auth/me', {
      headers: { Authorization: 'Bearer ' + token }
    });
    console.dir(meRes.data, { depth: null });
    
    const serverRes = await axios.get('https://my-chat-backend-suva.onrender.com/api/servers', {
      headers: { Authorization: 'Bearer ' + token }
    });
    console.dir(serverRes.data, { depth: null });

  } catch (err) {
    console.error('REST API error:', err.response ? err.response.data : err.message);
  }
}
test();
