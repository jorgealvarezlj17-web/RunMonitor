const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const cleanupCode = `
             await setDoc(doc(db, 'whatsapp_backups', backupId), {
                 id: backupId, timestamp: new Date().toISOString(), recipient: 'WhatsApp y Telegram (Server Cron)', message: finalReport, status: result.success ? 'success' : 'failed', error: result.error || null, type: 'reporte_programado', shiftKey: shiftKey
             });

             // --- SHIFT STATE CLEANUP ---
             try {
                const { deleteDoc } = await import('firebase/firestore');
                
                let currentTanksAireacion = [];
                let currentTanksMovimiento = [];
                const tanksSnap = await getDoc(doc(db, 'config', 'current_shift_tanks'));
                if (tanksSnap.exists()) {
                   currentTanksAireacion = tanksSnap.data().tanquesAireacion || [];
                   currentTanksMovimiento = tanksSnap.data().tanquesMovimiento || [];
                }
                await setDoc(doc(db, 'config', 'previous_shift_tanks'), {
                   tanquesAireacion: currentTanksAireacion,
                   tanquesMovimiento: currentTanksMovimiento,
                   timestamp: new Date().toISOString()
                });
                
                await deleteDoc(doc(db, 'config', 'current_shift_observations'));
                await deleteDoc(doc(db, 'config', 'current_shift_maintenance'));
                
                console.log("[Server Cron] Shift state cleaned up successfully.");
             } catch(cleanupErr) {
                console.error("[Server Cron] Cleanup Error:", cleanupErr.message);
             }
             // ----------------------------
`;

code = code.replace(/await setDoc\(doc\(db, 'whatsapp_backups', backupId\), \{[\s\S]*?shiftKey: shiftKey\s*\}\);/, cleanupCode);

fs.writeFileSync('server.ts', code);
