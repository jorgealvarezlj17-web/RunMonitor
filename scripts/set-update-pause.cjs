const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '..', 'firebase-applet-config.json');
const versionPath = path.join(__dirname, '..', 'public', 'version.json');

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const version = JSON.parse(fs.readFileSync(versionPath, 'utf8'));

const isUpdating = process.argv[2] !== 'false';
const buildId = version.buildId || `build-${Date.now()}`;
const notice = process.argv[3] || 'Se están sincronizando mejoras y cambios en el sistema central de la planta. El acceso y registro de operaciones se encuentra temporalmente detenido.';

const url = `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/${config.firestoreDatabaseId}/documents/config/app_settings?updateMask.fieldPaths=isUpdatingApp&updateMask.fieldPaths=targetBuildId&updateMask.fieldPaths=lastUpdatedTimestamp&updateMask.fieldPaths=updateNotice&key=${config.apiKey}`;

fetch(url, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    fields: {
      isUpdatingApp: { booleanValue: isUpdating },
      targetBuildId: { stringValue: buildId },
      updateNotice: { stringValue: notice },
      lastUpdatedTimestamp: { stringValue: new Date().toISOString() }
    }
  })
})
  .then(res => {
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    return res.json();
  })
  .then(() => {
    console.log(`[PAUSE SYNC] Firestore update status set to: isUpdatingApp=${isUpdating} (targetBuildId: ${buildId})`);
    process.exit(0);
  })
  .catch(err => {
    console.error('[PAUSE SYNC ERROR]:', err.message);
    process.exit(1);
  });
