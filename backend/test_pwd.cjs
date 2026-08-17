const { Client } = require('pg');
const crypto = require('crypto');
async function test() {
  const client = new Client({ connectionString: 'postgresql://neondb_owner:npg_XzpIbLK7BV1N@ep-sparkling-lake-za5s44ki.c-2.eu-west-2.aws.neon.tech/neondb?sslmode=require' });
  await client.connect();
  const res = await client.query("UPDATE users SET hashed_password = \ WHERE email = 'nathans_hair@hotmail.com'", ['']); // This is bcrypt for 'password'
  console.log('Updated rows:', res.rowCount);
  await client.end();
}
test();
