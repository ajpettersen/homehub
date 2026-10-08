import React, { useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const MAX_EDGE = 2400;
const MAX_BYTES = 5 * 1024 * 1024;

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Shrinks the photo and re-saves it as a JPEG in the browser. Redrawing it
 * also drops the camera's metadata, including the GPS location a phone
 * photo of the house would otherwise carry.
 */
async function preparePhoto(file: File): Promise<string> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("Couldn't read that photo. Try a JPEG or PNG. iPhone HEIC photos open best from Safari.");
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of [0.85, 0.7, 0.55]) {
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= MAX_BYTES) return blobToDataUrl(blob);
  }
  throw new Error("That photo is too large even after shrinking it.");
}

async function errorFrom(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => null) as { error?: string } | null;
  return body?.error ?? fallback;
}

/** Settings: the background photo on the wall screen's Home tab (/kiosk). */
export function WallScreenPhotoSection() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [version, setVersion] = useState(() => Date.now());
  const [hasPhoto, setHasPhoto] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File) => {
    setBusy("upload");
    setError(null);
    try {
      const image = await preparePhoto(file);
      const response = await fetch("/api/household/kiosk-photo", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image }),
      });
      if (!response.ok) throw new Error(await errorFrom(response, "Couldn't save the photo."));
      setVersion(Date.now());
      setHasPhoto(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the photo.");
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy("remove");
    setError(null);
    try {
      const response = await fetch("/api/household/kiosk-photo", { method: "DELETE" });
      if (!response.ok) throw new Error(await errorFrom(response, "Couldn't remove the photo."));
      setHasPhoto(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't remove the photo.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Shown behind the clock on the wall screen's Home tab. A wide photo with sky at the top works best.
        Without one, the screen shows a day-and-night sky.
      </p>

      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-sky-300 via-sky-200 to-orange-200">
        {hasPhoto !== false && (
          <img
            key={version}
            src={`/api/household/kiosk-photo?v=${version}`}
            alt="Wall screen background"
            className={`h-full w-full object-cover ${hasPhoto ? "" : "invisible"}`}
            onLoad={() => setHasPhoto(true)}
            onError={() => setHasPhoto(false)}
          />
        )}
        {hasPhoto === false && (
          <p className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-sky-900/70">No photo yet</p>
        )}
        {busy === "upload" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <Loader2 className="h-8 w-8 animate-spin text-white" />
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={event => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void upload(file);
        }}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => inputRef.current?.click()} disabled={busy !== null}>
          <ImagePlus className="mr-2 h-4 w-4" />
          {hasPhoto ? "Replace photo" : "Choose photo"}
        </Button>
        {hasPhoto && (
          <Button type="button" variant="outline" onClick={() => void remove()} disabled={busy !== null}>
            {busy === "remove" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
            Remove
          </Button>
        )}
      </div>
      {error && <p role="alert" className="text-sm font-semibold text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">The wall screen picks up a new photo within a minute.</p>
    </div>
  );
}
