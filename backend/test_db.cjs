const { Client } = require('pg');

async function test() {
  const client = new Client({
    connectionString: "postgresql://neondb_owner:npg_XzpIbLK7BV1N@ep-sparkling-lake-za5s44ki.c-2.eu-west-2.aws.neon.tech/neondb?sslmode=require",
  });
  
  try {
    await client.connect();
    
    const usersRes = await client.query('SELECT id, username FROM users');
    console.log('Users:', usersRes.rows);
    
    const serversRes = await client.query('SELECT id, name FROM servers');
    console.log('Servers:', serversRes.rows);
    
    const channelsRes = await client.query('SELECT id, server_id, name FROM channels');
    console.log('Channels:', channelsRes.rows);
    
  } catch (err) {
    console.error('DB Error:', err.message);
  } finally {
    await client.end();
  }
}
test();
