import React, { createContext, useContext, useEffect, useState } from 'react';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';

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
  const [profile, setProfile] = useState<Profile | null>(() => {
    try {
      const cached = localStorage.getItem('cached_user_profile');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState<boolean>(() => {
    try {
      const cached = localStorage.getItem('cached_user_profile');
      return cached ? false : true;
    } catch {
      return true;
    }
  });

  const updateCachedProfile = (newProfile: Profile | null) => {
    setProfile(newProfile);
    if (newProfile) {
      try {
        localStorage.setItem('cached_user_profile', JSON.stringify(newProfile));
      } catch (e) {
        console.warn('Could not cache user profile:', e);
      }
    } else {
      localStorage.removeItem('cached_user_profile');
    }
  };

  const logout = async () => {
    try {
      localStorage.removeItem('cached_auth_user');
      localStorage.removeItem('cached_user_profile');
    } catch {}
    updateCachedProfile(null);
    if (auth.currentUser) {
      const profileRef = doc(db, 'profiles', auth.currentUser.uid);
      try {
        await setDoc(profileRef, { is_online: false, last_connection: new Date().toISOString() }, { merge: true });
      } catch (err) {
        console.error('Error setting offline status on logout:', err);
      }
    }
    await signOut(auth);
  };

  useEffect(() => {
    let unsubscribeProfile: (() => void) | undefined;
    let currentUserRef: ReturnType<typeof doc> | undefined;

    const markOfflineImmediate = () => {
      if (currentUserRef && typeof navigator !== 'undefined' && navigator.onLine) {
        setDoc(currentUserRef, { 
          is_online: false, 
          last_connection: new Date().toISOString() 
        }, { merge: true }).catch(err => {
          console.warn('Error setting offline status:', err);
        });
      }
    };

    const markOnlineImmediate = () => {
      if (currentUserRef && document.visibilityState === 'visible' && !document.hidden && typeof navigator !== 'undefined' && navigator.onLine) {
        setDoc(currentUserRef, { 
          is_online: true, 
          last_connection: new Date().toISOString() 
        }, { merge: true }).catch(err => {
          console.warn('Error setting online status:', err);
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
        // Cache user info immediately for offline support
        try {
          localStorage.setItem('cached_auth_user', JSON.stringify({
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            photoURL: user.photoURL
          }));
        } catch (e) {
          console.warn('Error caching auth user:', e);
        }

        const profileRef = doc(db, 'profiles', user.uid);
        currentUserRef = profileRef;
        const userEmailLower = user.email ? user.email.toLowerCase().trim() : '';
        const isAdminEmail = isMasterAdminEmail(userEmailLower);

        const updatePresence = async (isViewing = true) => {
          if (!currentUserRef) return;
          if (typeof navigator !== 'undefined' && !navigator.onLine) return;
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
            console.warn('Error updating presence:', err);
          }
        };

        // Update online status immediately if tab is visible and online
        if (typeof navigator !== 'undefined' && navigator.onLine && document.visibilityState === 'visible' && !document.hidden) {
          updatePresence(true).catch(() => {});
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

        // Realtime whitelist/authorization listener for non-admin accounts
        let unsubscribeAllowedEmail: (() => void) | undefined;

        if (!isAdminEmail) {
          if (!userEmailLower) {
            console.warn('[Security] User has no email. Revoking session.');
            sessionStorage.setItem('auth_revoked_reason', 'Acceso denegado: Se requiere una cuenta con correo autorizado.');
            updateCachedProfile(null);
            signOut(auth).catch((e) => console.error('Sign out error:', e));
          } else {
            const allowedDocRef = doc(db, 'allowed_emails', userEmailLower);
            unsubscribeAllowedEmail = onSnapshot(allowedDocRef, (allowedSnap) => {
              // Si no hay red o el snapshot es de caché no definitivo, no revocar
              if (typeof navigator !== 'undefined' && !navigator.onLine) {
                return;
              }
              const isFromCache = !!(allowedSnap as any)?.metadata?.fromCache;
              if (isFromCache && !allowedSnap.exists()) {
                return;
              }

              if (!allowedSnap.exists()) {
                console.warn('[Security] User email removed from allowed_emails whitelist. Revoking session immediately.');
                sessionStorage.setItem('auth_revoked_reason', 'Acceso revocado: Tu correo fue eliminado de la lista de personal autorizado.');
                if (currentUserRef) {
                  setDoc(currentUserRef, { is_online: false, last_connection: new Date().toISOString() }, { merge: true }).catch(() => {});
                }
                updateCachedProfile(null);
                signOut(auth).catch((e) => console.error('Sign out error:', e));
                return;
              }

              const allowedData = allowedSnap.data();
              if (allowedData?.status === 'inactive') {
                console.warn('[Security] User email status set to inactive. Revoking session immediately.');
                sessionStorage.setItem('auth_revoked_reason', 'Acceso suspendido: Tu cuenta ha sido desactivada temporalmente por el administrador.');
                if (currentUserRef) {
                  setDoc(currentUserRef, { is_online: false, last_connection: new Date().toISOString() }, { merge: true }).catch(() => {});
                }
                updateCachedProfile(null);
                signOut(auth).catch((e) => console.error('Sign out error:', e));
                return;
              }
            }, (err) => {
              console.warn('Notice listening to allowed_emails status (offline/cache):', err);
            });
          }
        }

        // Listen to profile changes directly without blocking getDoc
        unsubscribeProfile = onSnapshot(profileRef, async (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data() as Profile;
            
            // Auto-promote master admin or sync admin role if needed
            if (isAdminEmail) {
              if (data.role !== 'admin' || !data.is_synced) {
                try {
                  await setDoc(profileRef, { role: 'admin', is_synced: true }, { merge: true });
                } catch (err) {
                  console.warn('Error setting admin role sync:', err);
                }
              }
            } else if (data.role === 'admin' && !data.is_synced) {
              // Ensure any admin user has is_synced: true so they are never in read-only mode
              try {
                await setDoc(profileRef, { is_synced: true }, { merge: true });
              } catch (err) {
                console.warn('Error setting admin is_synced:', err);
              }
            }
            
            updateCachedProfile(data);
            setLoading(false);
          } else {
            const isSnapshotFromCache = !!(docSnap as any)?.metadata?.fromCache;
            const isOfflineNow = typeof navigator !== 'undefined' && !navigator.onLine;

            // If server confirms doc doesn't exist, create initial profile
            if (!isSnapshotFromCache && !isOfflineNow) {
              let initialRole: 'admin' | 'operator' = isAdminEmail ? 'admin' : 'operator';
              let initialName = user.displayName || user.email?.split('@')[0] || (isAdminEmail ? 'Administrador' : 'Operador');

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
              
              updateCachedProfile(newProfile);
              setDoc(profileRef, newProfile).catch((err) => {
                console.warn('Could not write new profile to remote:', err);
              });
            }
            setLoading(false);
          }
        }, (err) => {
          console.warn('Profile snapshot notice (continuing with cached profile if offline):', err);
          setLoading(false);
        });

        const originalUnsubscribeProfile = unsubscribeProfile;
        unsubscribeProfile = () => {
          clearInterval(heartbeatInterval);
          window.removeEventListener('pointerdown', handleUserActivity);
          window.removeEventListener('keydown', handleUserActivity);
          window.removeEventListener('touchstart', handleUserActivity);
          if (unsubscribeAllowedEmail) unsubscribeAllowedEmail();
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

        // CRITICAL: Do not clear profile cache when offline or if cached auth session exists
        const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
        const hasCachedAuth = typeof window !== 'undefined' && !!localStorage.getItem('cached_auth_user');
        if (!isOffline && !hasCachedAuth) {
          updateCachedProfile(null);
        }
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
