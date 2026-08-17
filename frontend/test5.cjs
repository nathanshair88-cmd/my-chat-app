const axios = require('axios');

async function test() {
  try {
    const res = await axios.post('http://127.0.0.1:8000/api/auth/register', {
      username: 'tester_' + Date.now(),
      email: 'test' + Date.now() + '@test.com',
      password: 'password123'
    });
    const token = res.data.access_token;
    
    const serverRes = await axios.get('http://127.0.0.1:8000/api/servers', {
      headers: { Authorization: 'Bearer ' + token }
    });
    console.dir(serverRes.data, { depth: null });
  } catch (err) {
    console.error('REST API error:', err.response ? err.response.data : err.message);
  }
}
test();
