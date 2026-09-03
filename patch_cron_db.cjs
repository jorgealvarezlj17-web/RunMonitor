const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(
    "const db = getFirestore(app);",
    "const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);"
);

fs.writeFileSync('server.ts', code);
