import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useGetProperties } from '@workspace/api-client-react';

const STORAGE_KEY = '@homehub/selected_property_id';

interface Property {
  id: string;
  name: string;
  type: string;
  icon: string;
}

interface PropertyContextValue {
  selectedProperty: Property | null;
  properties: Property[];
  setSelectedProperty: (p: Property) => void;
  isLoading: boolean;
}

const PropertyContext = createContext<PropertyContextValue>({
  selectedProperty: null,
  properties: [],
  setSelectedProperty: () => {},
  isLoading: true,
});

export function PropertyProvider({ children }: { children: React.ReactNode }) {
  const { data: properties, isLoading } = useGetProperties();
  const [selectedProperty, setSelectedPropertyState] = useState<Property | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from AsyncStorage once properties load
  useEffect(() => {
    if (!properties?.length || hydrated) return;
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      const match = saved ? properties.find((p) => p.id === saved) : null;
      setSelectedPropertyState(match ?? properties[0]);
      setHydrated(true);
    });
  }, [properties, hydrated]);

  const setSelectedProperty = (p: Property) => {
    setSelectedPropertyState(p);
    AsyncStorage.setItem(STORAGE_KEY, p.id);
  };

  return (
    <PropertyContext.Provider
      value={{
        selectedProperty,
        properties: properties ?? [],
        setSelectedProperty,
        isLoading: isLoading || !hydrated,
      }}
    >
      {children}
    </PropertyContext.Provider>
  );
}

export function useProperty() {
  return useContext(PropertyContext);
}
