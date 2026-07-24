import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FamilyMember, useGetFamilyMembers } from '@workspace/api-client-react';

const STORAGE_KEY = '@homehub:activeMemberId';

interface ActiveMemberContextValue {
  activeMember: FamilyMember | null;
  activeMemberId: string | null;
  setActiveMemberId: (id: string) => void;
  isLoaded: boolean;
}

const ActiveMemberContext = createContext<ActiveMemberContextValue>({
  activeMember: null,
  activeMemberId: null,
  setActiveMemberId: () => {},
  isLoaded: false,
});

export function ActiveMemberProvider({ children }: { children: React.ReactNode }) {
  const { data: members } = useGetFamilyMembers();
  const [activeMemberId, setActiveMemberIdState] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from AsyncStorage on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored) setActiveMemberIdState(stored);
      setIsLoaded(true);
    });
  }, []);

  // Auto-select first human member if nothing is stored and members have loaded
  useEffect(() => {
    if (isLoaded && !activeMemberId && members?.length) {
      const first = members.find((m) => m.role !== 'pet');
      if (first) {
        setActiveMemberIdState(first.id);
        AsyncStorage.setItem(STORAGE_KEY, first.id);
      }
    }
  }, [isLoaded, activeMemberId, members]);

  const setActiveMemberId = (id: string) => {
    setActiveMemberIdState(id);
    AsyncStorage.setItem(STORAGE_KEY, id);
  };

  const activeMember = members?.find((m) => m.id === activeMemberId) ?? null;

  return (
    <ActiveMemberContext.Provider value={{ activeMember, activeMemberId, setActiveMemberId, isLoaded }}>
      {children}
    </ActiveMemberContext.Provider>
  );
}

export const useActiveMember = () => useContext(ActiveMemberContext);
