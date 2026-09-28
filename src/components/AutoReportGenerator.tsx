import React, { useState, useEffect, useRef } from 'react';
import { 
  collection, 
  doc, 
  onSnapshot 
} from 'firebase/firestore';
import { db } from '../firebase';
import { updateStagedUpcomingReport } from '../services/reportBuilder';

export function AutoReportGenerator() {
  const [startTime, setStartTime] = useState('18:00');
  const [endTime, setEndTime] = useState('18:00');
  const isStagingRef = useRef(false);
  const stagingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 1. Listen to app settings
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'config', 'app_settings'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.shiftStartTime) setStartTime(data.shiftStartTime);
        if (data.shiftEndTime) setEndTime(data.shiftEndTime);
      }
    });
    return () => unsub();
  }, []);

  // 2. Debounced stage function
  const triggerStaging = (delayMs = 1500) => {
    if (stagingTimeoutRef.current) {
      clearTimeout(stagingTimeoutRef.current);
    }
    stagingTimeoutRef.current = setTimeout(async () => {
      if (isStagingRef.current) return;
      isStagingRef.current = true;
      try {
        await updateStagedUpcomingReport({
          shiftStartTime: startTime,
          shiftEndTime: endTime
        });
      } catch (err) {
        console.warn('[AutoReportGenerator] Error updating staged upcoming report:', err);
      } finally {
        isStagingRef.current = false;
      }
    }, delayMs);
  };

  // 3. Listen to all relevant shift data changes to keep draft 100% in sync with Panel de Registro
  useEffect(() => {
    // Initial stage on startup
    triggerStaging(500);

    // Logs (when equipment is turned ON/OFF in Panel de Registro)
    const unsubLogs = onSnapshot(collection(db, 'logs'), () => triggerStaging(1200));

    // Equipment state changes
    const unsubEquip = onSnapshot(collection(db, 'equipment'), () => triggerStaging(1200));

    // Power events (cortes / fallas)
    const unsubPower = onSnapshot(collection(db, 'power_events'), () => triggerStaging(1200));

    // Shift notes, maintenance, and tanks
    const unsubObs = onSnapshot(doc(db, 'config', 'current_shift_observations'), () => triggerStaging(1200));
    const unsubMaint = onSnapshot(doc(db, 'config', 'current_shift_maintenance'), () => triggerStaging(1200));
    const unsubTanks = onSnapshot(doc(db, 'config', 'current_shift_tanks'), () => triggerStaging(1200));

    // Periodic check every 2 minutes
    const interval = setInterval(() => {
      triggerStaging(100);
    }, 120000);

    const handleFocus = () => {
      triggerStaging(300);
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);

    return () => {
      if (stagingTimeoutRef.current) clearTimeout(stagingTimeoutRef.current);
      clearInterval(interval);
      unsubLogs();
      unsubEquip();
      unsubPower();
      unsubObs();
      unsubMaint();
      unsubTanks();
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
    };
  }, [startTime, endTime]);

  return null;
}
