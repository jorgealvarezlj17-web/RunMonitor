console.log("UTC time:", new Date().toISOString());
console.log("Local hours:", new Date().getHours());
const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Caracas',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
});
console.log("Caracas time:", formatter.format(new Date()));
