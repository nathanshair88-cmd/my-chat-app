
const axios = require("axios");
async function test() {
  try {
    const res = await axios.options("https://my-chat-backend-auva.onrender.com/socket.io/?EIO=4&transport=polling", {
      headers: {
        "Origin": "https://disco-alto.vercel.app",
        "Access-Control-Request-Method": "GET"
      }
    });
    console.log("Status:", res.status);
    console.log("Headers:", res.headers);
  } catch (err) {
    console.error("Error Status:", err.response ? err.response.status : err.message);
    console.error("Error Headers:", err.response ? err.response.headers : "");
  }
}
test();

