import { createContext, useContext, useState, ReactNode } from 'react';
import { FamilyMember } from '@workspace/api-client-react';

interface ActiveMemberContextType {
  activeMember: FamilyMember | null;
  setActiveMember: (member: FamilyMember | null) => void;
}

const ActiveMemberContext = createContext<ActiveMemberContextType | undefined>(undefined);

export function ActiveMemberProvider({ children }: { children: ReactNode }) {
  const [activeMember, setActiveMember] = useState<FamilyMember | null>(null);

  return (
    <ActiveMemberContext.Provider value={{ activeMember, setActiveMember }}>
      {children}
    </ActiveMemberContext.Provider>
  );
}

export function useActiveMember() {
  const context = useContext(ActiveMemberContext);
  if (context === undefined) {
    throw new Error('useActiveMember must be used within an ActiveMemberProvider');
  }
  return context;
}
