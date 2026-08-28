const cron = require('node-cron');
const fs = require('fs');

process.env.TZ = 'America/Caracas';

console.log("Local time:", new Date().toString());
