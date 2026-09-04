import React, { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMe,
  getGetMeQueryKey,
  useGetMyFamilyProfile,
  getGetMyFamilyProfileQueryKey,
  useUpdateMyFamilyProfile,
  getGetFamilyMembersQueryKey,
  type SelfFamilyProfileUpdateColor
} from "@workspace/api-client-react";
import { Check, Image as ImageIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const COLORS = [
  "#C1440E","#2D6A4F","#E07B39","#4A90D9","#9B59B6",
  "#E74C3C","#2ECC71","#F39C12","#1ABC9C","#E91E8C","#607D8B","#795548",
];

export function YourProfile() {
  const queryClient = useQueryClient();
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  
  const isFamily = me?.role === "family";
  
  const { data: profile, isLoading, isError } = useGetMyFamilyProfile({
    query: { 
      queryKey: getGetMyFamilyProfileQueryKey(),
      enabled: isFamily,
      retry: false
    }
  });

  const updateProfile = useUpdateMyFamilyProfile();
  
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>("");
  const [photoUrl, setPhotoUrl] = useState("");
  
  const [isEditing, setIsEditing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  
  const initializedProfileId = useRef<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    
    // Always initialize on identity change or when NOT actively editing.
    if (initializedProfileId.current !== profile.id || !isEditing) {
      setName(profile.name);
      setColor(profile.color);
      setPhotoUrl(profile.photoUrl || "");
      
      // If identity changed entirely, safely exit editing mode
      if (initializedProfileId.current !== profile.id) {
        setIsEditing(false);
      }
      
      initializedProfileId.current = profile.id;
    }
  }, [profile, isEditing]);

  // Reset form when cancelling
  const handleCancel = () => {
    if (profile) {
      setName(profile.name);
      setColor(profile.color);
      setPhotoUrl(profile.photoUrl || "");
    }
    setIsEditing(false);
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    
    if (!name.trim()) {
      setErrorMsg("Name is required.");
      return;
    }
    
    if (photoUrl.trim() && !/^https?:\/\//.test(photoUrl.trim())) {
      setErrorMsg("Photo URL must start with http:// or https://");
      return;
    }

    try {
      await updateProfile.mutateAsync({
        data: {
          name: name.trim(),
          color: color as SelfFamilyProfileUpdateColor,
          photoUrl: photoUrl.trim() || null
        }
      });
      
      setSuccessMsg("Profile updated.");
      setIsEditing(false);
      
      // Invalidate queries to refresh names across the app
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getGetFamilyMembersQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getGetMyFamilyProfileQueryKey() });
      
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to update profile.");
    }
  };

  if (!isFamily || isError) {
    return null;
  }

  if (isLoading || !profile) {
    return (
      <div className="animate-pulse flex items-center gap-4 p-5 border border-border rounded-2xl bg-card">
        <div className="w-14 h-14 rounded-full bg-muted"></div>
        <div className="space-y-2 flex-1">
          <div className="h-4 w-32 bg-muted rounded"></div>
          <div className="h-3 w-48 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <section className="border border-border rounded-2xl bg-card shadow-sm p-5 flex flex-col md:flex-row gap-5 items-start md:items-center">
      <div className="flex-1 flex flex-col sm:flex-row items-start sm:items-center gap-4 min-w-0 w-full">
        <Avatar className="w-16 h-16 border-2 shadow-sm shrink-0" style={{ borderColor: isEditing ? color : profile.color }}>
          <AvatarImage src={(isEditing ? photoUrl : profile.photoUrl) || undefined} className="object-cover" />
          <AvatarFallback className="text-white font-bold text-xl" style={{ backgroundColor: isEditing ? color : profile.color }}>
            {(isEditing ? name : profile.name).charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        
        {!isEditing ? (
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-xl text-foreground truncate tracking-tight">{profile.name}</h3>
            <p className="text-sm text-muted-foreground mt-0.5">Your personal family profile</p>
            {successMsg && (
              <p className="text-xs text-green-600 font-medium mt-1.5 flex items-center gap-1 bg-green-500/10 px-2 py-1 rounded-md inline-flex">
                <Check className="w-3.5 h-3.5" /> {successMsg}
              </p>
            )}
          </div>
        ) : (
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-base text-foreground mb-1">Editing Profile</h3>
            <p className="text-xs text-muted-foreground">Changes apply to your account only.</p>
          </div>
        )}
      </div>

      {!isEditing ? (
        <button 
          onClick={() => setIsEditing(true)}
          className="shrink-0 w-full md:w-auto px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 transition-colors shadow-sm"
        >
          Edit Profile
        </button>
      ) : (
        <form onSubmit={handleSave} className="w-full md:w-auto flex-1 md:max-w-sm bg-background/50 border border-border rounded-xl p-4 space-y-4 shadow-sm">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Display Name</label>
            <input 
              type="text" 
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-bold focus:outline-none focus:border-primary shadow-sm"
              required
              maxLength={100}
            />
          </div>
          
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Color</label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map(c => (
                <button 
                  key={c} 
                  type="button" 
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full border-2 transition-transform ${color === c ? "border-foreground scale-110 shadow-md" : "border-transparent hover:scale-105"}`}
                  style={{ backgroundColor: c }}
                  aria-label={`Select color ${c}`}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Photo URL (Optional)</label>
            <div className="relative">
              <ImageIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input 
                type="url" 
                value={photoUrl}
                onChange={e => setPhotoUrl(e.target.value)}
                placeholder="https://..."
                className="w-full bg-background border border-border rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-primary shadow-sm"
              />
            </div>
          </div>

          {errorMsg && (
            <div className="text-xs font-medium text-destructive bg-destructive/10 p-2.5 rounded-lg border border-destructive/20">
              {errorMsg}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button 
              type="button" 
              onClick={handleCancel}
              className="flex-1 py-2 rounded-lg border border-border bg-card text-sm font-bold hover:bg-muted transition-colors shadow-sm"
              disabled={updateProfile.isPending}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={updateProfile.isPending || !name.trim()}
              className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-sm"
            >
              {updateProfile.isPending ? "Saving..." : <><Check className="w-4 h-4" /> Save</>}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
