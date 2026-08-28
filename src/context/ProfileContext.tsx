import React, { createContext, useContext, useEffect, useState } from 'react';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'operator';
  is_synced: boolean;
  is_online: boolean;
  last_connection?: string;
  photo_url?: string;
}

export const isMasterAdminEmail = (email: string | null | undefined): boolean => {
  if (!email) return false;
  const normalized = email.toLowerCase().trim();
  return normalized === 'jorgealvarez.lj17@gmail.com' || normalized === 'j.alvarez.lj17@gmail.com';
};

interface ProfileContextType {
  profile: Profile | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const ProfileContext = createContext<ProfileContextType>({ profile: null, loading: true, logout: async () => {} });

export const ProfileProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = async () => {
    if (auth.currentUser) {
      const profileRef = doc(db, 'profiles', auth.currentUser.uid);
      try {
        await setDoc(profileRef, { is_online: false, last_connection: new Date().toISOString() }, { merge: true });
      } catch (err) {
        console.error('Error setting offline status on logout:', err);
      }
    }
    await auth.signOut();
  };

  useEffect(() => {
    let unsubscribeProfile: (() => void) | undefined;
    let currentUserRef: ReturnType<typeof doc> | undefined;

    const markOfflineImmediate = () => {
      if (currentUserRef) {
        setDoc(currentUserRef, { 
          is_online: false, 
          last_connection: new Date().toISOString() 
        }, { merge: true }).catch(err => {
          console.error('Error setting offline status:', err);
        });
      }
    };

    const markOnlineImmediate = () => {
      if (currentUserRef && document.visibilityState === 'visible' && !document.hidden) {
        setDoc(currentUserRef, { 
          is_online: true, 
          last_connection: new Date().toISOString() 
        }, { merge: true }).catch(err => {
          console.error('Error setting online status:', err);
        });
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' || document.hidden) {
        markOfflineImmediate();
      } else {
        markOnlineImmediate();
      }
    };

    window.addEventListener('beforeunload', markOfflineImmediate);
    window.addEventListener('pagehide', markOfflineImmediate);
    window.addEventListener('visibilitychange', handleVisibilityChange);

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const profilePath = `profiles/${user.uid}`;
        const profileRef = doc(db, 'profiles', user.uid);
        currentUserRef = profileRef;
        
        // Check if profile exists, if not create it
        let docSnap;
        try {
          docSnap = await getDoc(profileRef);
        } catch (err) {
          handleFirestoreError(err, OperationType.GET, profilePath);
        }

        const updatePresence = async (isViewing = true) => {
          if (!currentUserRef) return;
          // If document is hidden, never send an online heartbeat
          if (document.hidden || document.visibilityState === 'hidden') {
            return;
          }
          const isCurrentlyVisible = isViewing && document.visibilityState === 'visible' && !document.hidden;
          try {
            const updates: any = { 
              is_online: isCurrentlyVisible, 
              last_connection: new Date().toISOString() 
            };
            if (user.photoURL) {
              updates.photo_url = user.photoURL;
            }
            if (user.displayName) {
              updates.full_name = user.displayName;
            }
            await setDoc(currentUserRef, updates, { merge: true });
          } catch (err) {
            console.error('Error updating presence:', err);
          }
        };

        if (!docSnap || !docSnap.exists()) {
          const userEmailLower = user.email ? user.email.toLowerCase().trim() : '';
          const isAdminEmail = isMasterAdminEmail(userEmailLower);
          
          let initialRole: 'admin' | 'operator' = isAdminEmail ? 'admin' : 'operator';
          let initialName = user.displayName || user.email?.split('@')[0] || (isAdminEmail ? 'Administrador' : 'Operador');

          // Check if there is pre-configured data in allowed_emails
          try {
            const allowedDoc = await getDoc(doc(db, 'allowed_emails', userEmailLower));
            if (allowedDoc.exists()) {
              const allowedData = allowedDoc.data();
              if (allowedData.name) initialName = allowedData.name;
              if (allowedData.role === 'admin') initialRole = 'admin';
            }
          } catch (e) {
            console.warn('Could not read allowed_emails for initial profile:', e);
          }

          const newProfile: Profile = {
            id: user.uid,
            email: user.email || '',
            full_name: initialName,
            role: initialRole,
            is_synced: true,
            is_online: document.visibilityState === 'visible' && !document.hidden,
            last_connection: new Date().toISOString()
          };
          if (user.photoURL) {
            newProfile.photo_url = user.photoURL;
          }
          try {
            await setDoc(profileRef, newProfile);
          } catch (err) {
            handleFirestoreError(err, OperationType.WRITE, profilePath);
          }
        } else {
          // Update online status and metadata immediately based on visibility
          if (document.visibilityState === 'visible' && !document.hidden) {
            await updatePresence(true);
          }
        }

        // Live heartbeat every 4 seconds while user is actively looking at the app
        const heartbeatInterval = setInterval(() => {
          if (document.visibilityState === 'visible' && !document.hidden) {
            updatePresence(true);
          }
        }, 4000);

        // User activity listener for presence (throttled to 4s)
        let lastActivityUpdate = Date.now();
        const handleUserActivity = () => {
          const now = Date.now();
          if (now - lastActivityUpdate > 4000 && document.visibilityState === 'visible' && !document.hidden) {
            lastActivityUpdate = now;
            updatePresence(true);
          }
        };

        window.addEventListener('pointerdown', handleUserActivity);
        window.addEventListener('keydown', handleUserActivity);
        window.addEventListener('touchstart', handleUserActivity);

        // Listen to profile changes
        unsubscribeProfile = onSnapshot(profileRef, async (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data() as Profile;
            
            // Auto-promote ONLY the master admin user if needed
            const userEmailLower = user.email ? user.email.toLowerCase().trim() : '';
            const isAdminEmail = isMasterAdminEmail(userEmailLower);
            
            if (isAdminEmail) {
              if (data.role !== 'admin' || !data.is_synced) {
                try {
                  await setDoc(profileRef, { role: 'admin', is_synced: true }, { merge: true });
                } catch (err) {
                  handleFirestoreError(err, OperationType.WRITE, profilePath);
                }
                return;
              }
            }
            
            setProfile(data);
          }
          setLoading(false);
        }, (err) => {
          handleFirestoreError(err, OperationType.GET, profilePath);
        });

        const originalUnsubscribeProfile = unsubscribeProfile;
        unsubscribeProfile = () => {
          clearInterval(heartbeatInterval);
          window.removeEventListener('pointerdown', handleUserActivity);
          window.removeEventListener('keydown', handleUserActivity);
          window.removeEventListener('touchstart', handleUserActivity);
          if (originalUnsubscribeProfile) originalUnsubscribeProfile();
        };

      } else {
        if (currentUserRef) {
          markOfflineImmediate();
          currentUserRef = undefined;
        }
        if (unsubscribeProfile) {
          unsubscribeProfile();
          unsubscribeProfile = undefined;
        }
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      window.removeEventListener('beforeunload', markOfflineImmediate);
      window.removeEventListener('pagehide', markOfflineImmediate);
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      if (currentUserRef) {
        markOfflineImmediate();
      }
      if (unsubscribeProfile) {
        unsubscribeProfile();
      }
    };
  }, []);

  return (
    <ProfileContext.Provider value={{ profile, loading, logout }}>
      {children}
    </ProfileContext.Provider>
  );
};

export const useProfile = () => useContext(ProfileContext);
