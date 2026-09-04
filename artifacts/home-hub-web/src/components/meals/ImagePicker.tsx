import { useRef } from "react";
import { Camera, ImagePlus } from "lucide-react";

export type PickedImage = { dataUrl: string; name: string; size: number };

async function readImage(file: File): Promise<PickedImage> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file.");
  if (file.size > 8 * 1024 * 1024) throw new Error("That image is larger than 8 MB.");
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read that image."));
    reader.readAsDataURL(file);
  });
  return { dataUrl, name: file.name, size: file.size };
}

export function ImagePicker({ multiple = false, onPick }: { multiple?: boolean; onPick: (images: PickedImage[]) => void }) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const handle = async (files: FileList | null) => {
    if (!files?.length) return;
    try {
      const picked = await Promise.all(Array.from(files).slice(0, multiple ? 6 : 1).map(readImage));
      onPick(picked);
    } catch (error) {
      onPick([{ dataUrl: "", name: error instanceof Error ? error.message : "Image selection failed", size: -1 }]);
    }
  };
  return (
    <div className="flex gap-2">
      <input ref={cameraRef} hidden type="file" accept="image/*" capture="environment" onChange={e => void handle(e.target.files)} />
      <input ref={libraryRef} hidden type="file" accept="image/*" multiple={multiple} onChange={e => void handle(e.target.files)} />
      <button type="button" data-testid="button-camera-image" onClick={() => cameraRef.current?.click()} className="min-h-11 flex-1 rounded-xl border border-primary/25 bg-primary/5 px-3 py-2 text-sm font-semibold text-primary">
        <Camera className="mr-2 inline h-4 w-4" /> Camera
      </button>
      <button type="button" data-testid="button-library-image" onClick={() => libraryRef.current?.click()} className="min-h-11 flex-1 rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold">
        <ImagePlus className="mr-2 inline h-4 w-4" /> Library
      </button>
    </div>
  );
}