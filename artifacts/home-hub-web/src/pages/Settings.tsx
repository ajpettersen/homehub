import { useGetFamilyMembers, getGetFamilyMembersQueryKey, useGetProperties, getGetPropertiesQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Settings as SettingsIcon, Home, Users } from "lucide-react";

export default function Settings() {
  const { data: familyMembers } = useGetFamilyMembers({ query: { queryKey: getGetFamilyMembersQueryKey() } });
  const { data: properties } = useGetProperties({ query: { queryKey: getGetPropertiesQueryKey() } });

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div>
        <h1 className="text-4xl font-serif font-bold flex items-center gap-3">
          <SettingsIcon className="w-8 h-8 text-muted-foreground" /> Settings
        </h1>
        <p className="text-muted-foreground mt-2">Manage your household configuration.</p>
      </div>

      <div className="space-y-8">
        <section>
          <h2 className="text-2xl font-serif font-semibold border-b-2 border-border pb-2 mb-6 flex items-center gap-2">
            <Users className="w-6 h-6" /> Family Members
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {familyMembers?.map(member => (
              <Card key={member.id} className="bg-card">
                <CardContent className="p-6 flex items-center gap-4">
                  <div 
                    className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-xl shadow-inner shrink-0"
                    style={{ backgroundColor: member.color || 'var(--color-primary)' }}
                  >
                    {member.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-bold text-lg leading-tight">{member.name}</h3>
                    <p className="text-sm text-muted-foreground capitalize">{member.role}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-serif font-semibold border-b-2 border-border pb-2 mb-6 flex items-center gap-2">
            <Home className="w-6 h-6" /> Properties
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {properties?.map(property => (
              <Card key={property.id} className="bg-card">
                <CardContent className="p-6 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center text-2xl shrink-0">
                    {property.icon || '🏠'}
                  </div>
                  <div>
                    <h3 className="font-bold text-lg leading-tight">{property.name}</h3>
                    <p className="text-sm text-muted-foreground capitalize">{property.type}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
