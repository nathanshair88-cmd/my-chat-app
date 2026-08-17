
const axios = require("axios");

async function test() {
  try {
    const loginRes = await axios.post("https://my-chat-backend-suva.onrender.com/api/auth/login", {
      email: "test1786913554051@test.com",
      password: "password123"
    });
    const token = loginRes.data.access_token;
    console.log("Token length:", token.length);
    
    const url = "https://my-chat-backend-suva.onrender.com/socket.io/?token=" + token + "&EIO=4&transport=polling";
    console.log("Testing URL:", url);
    
    const res = await axios.get(url, {
      headers: {
        "Origin": "https://disco-alto.vercel.app"
      }
    });
    console.log("Status:", res.status);
    console.log("Headers:", res.headers);
    console.log("Data:", res.data);
  } catch (err) {
    console.error("Error Status:", err.response ? err.response.status : err.message);
    console.error("Error Headers:", err.response ? err.response.headers : "");
    console.error("Error Data:", err.response ? err.response.data : "");
  }
}
test();

