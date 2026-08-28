import fs from 'fs';
import fetch from 'node-fetch';

async function test() {
  const res = await fetch('http://localhost:3000/api/admin/trigger-report', { method: 'POST' });
  console.log(await res.text());
}
test();
