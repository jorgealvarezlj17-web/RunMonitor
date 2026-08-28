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

    const handleBeforeUnload = () => {
      if (currentUserRef) {
        setDoc(currentUserRef, { is_online: false, last_connection: new Date().toISOString() }, { merge: true }).catch(err => {
          console.error('Error setting offline status:', err);
        });
      }
    };

    const handleVisibilityChange = () => {
      if (currentUserRef) {
        if (document.visibilityState === 'hidden') {
          setDoc(currentUserRef, { is_online: false, last_connection: new Date().toISOString() }, { merge: true }).catch(err => {
            console.error('Error setting offline status:', err);
          });
        } else {
          setDoc(currentUserRef, { is_online: true, last_connection: new Date().toISOString() }, { merge: true }).catch(err => {
            console.error('Error setting online status:', err);
          });
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
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

        const updatePresence = async () => {
          if (!currentUserRef) return;
          try {
            const updates: any = { 
              is_online: true, 
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
          const isAdminEmail = userEmailLower.startsWith('jorgealvarez.lj17@') || 
                               userEmailLower === 'jorgealvarez.lj17@gmail.com';
          const newProfile: Profile = {
            id: user.uid,
            email: user.email || '',
            full_name: user.displayName || user.email?.split('@')[0] || (isAdminEmail ? 'Administrador' : 'Operador'),
            role: isAdminEmail ? 'admin' : 'operator', // Default role
            is_synced: isAdminEmail, // Only admin is synced by default
            is_online: true,
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
          // Update online status and metadata immediately
          await updatePresence();
        }

        // Set up heartbeat every 60 seconds
        const heartbeatInterval = setInterval(updatePresence, 60000);

        // Listen to profile changes
        unsubscribeProfile = onSnapshot(profileRef, async (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data() as Profile;
            
            // Auto-promote the initial admin user if they are not admin or not synced
            const userEmailLower = user.email ? user.email.toLowerCase().trim() : '';
            const isAdminEmail = userEmailLower.startsWith('jorgealvarez.lj17@') || 
                                 userEmailLower === 'jorgealvarez.lj17@gmail.com';
            
            if (isAdminEmail) {
              if (data.role !== 'admin' || !data.is_synced) {
                try {
                  await setDoc(profileRef, { role: 'admin', is_synced: true }, { merge: true });
                } catch (err) {
                  handleFirestoreError(err, OperationType.WRITE, profilePath);
                }
                return; // The next snapshot will have the updated data
              }
            }
            
            setProfile(data);
          }
          setLoading(false);
        }, (err) => {
          handleFirestoreError(err, OperationType.GET, profilePath);
        });

        // Attach the interval clear to the cleanup logic
        const originalUnsubscribeProfile = unsubscribeProfile;
        unsubscribeProfile = () => {
          clearInterval(heartbeatInterval);
          if (originalUnsubscribeProfile) originalUnsubscribeProfile();
        };

      } else {
        if (currentUserRef) {
          setDoc(currentUserRef, { is_online: false, last_connection: new Date().toISOString() }, { merge: true }).catch(err => {
            console.error('Error setting offline status:', err);
          });
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
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      if (currentUserRef) {
        setDoc(currentUserRef, { is_online: false, last_connection: new Date().toISOString() }, { merge: true }).catch(err => {
          console.error('Error setting offline status:', err);
        });
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
