const { Client } = require('pg');
async function test() {
  const client = new Client({ connectionString: 'postgresql://neondb_owner:npg_XzpIbLK7BV1N@ep-sparkling-lake-za5s44ki.c-2.eu-west-2.aws.neon.tech/neondb?sslmode=require' });
  await client.connect();
  const res = await client.query("SELECT email FROM users WHERE username = 'EazyPax420'");
  console.log(res.rows);
  await client.end();
}
test();
