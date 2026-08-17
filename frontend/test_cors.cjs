const axios = require('axios');

async function test() {
  try {
    const res = await axios.get('https://my-chat-backend-suva.onrender.com/socket.io/?EIO=4&transport=polling', {
      headers: {
        'Origin': 'https://disco-alto.vercel.app'
      }
    });
    console.log('Status:', res.status);
    console.log('Headers:', res.headers);
    console.log('Data:', res.data);
  } catch (err) {
    console.error('Error Status:', err.response ? err.response.status : err.message);
    console.error('Error Headers:', err.response ? err.response.headers : '');
    console.error('Error Data:', err.response ? err.response.data : '');
  }
}
test();
