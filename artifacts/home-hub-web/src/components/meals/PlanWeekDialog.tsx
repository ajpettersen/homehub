import * as React from "react";
import { useState, useRef, useEffect } from "react";
import { Loader2, Sparkles, X, Brain, Send } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ImagePicker, type PickedImage } from "./ImagePicker";

type Message = { role: 'user' | 'assistant', content: string };

interface PlanWeekDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChat: (messages: Message[]) => Promise<string>;
  onPlan: (messages: Message[], imagesBase64: string[]) => Promise<void>;
}

const MAX_TOTAL_IMAGE_BYTES = 10 * 1024 * 1024;
const INITIAL_MESSAGES: Message[] = [
  { role: 'assistant', content: "Hello! What kind of meals are we thinking about this week? You can also show me what's in your fridge or pantry." }
];

export function PlanWeekDialog({ open, onOpenChange, onChat, onPlan }: PlanWeekDialogProps) {
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [inputValue, setInputValue] = useState("");
  const [images, setImages] = useState<PickedImage[]>([]);
  const [error, setError] = useState("");
  const [isPlanning, setIsPlanning] = useState(false);
  const [isChatting, setIsChatting] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isChatting]);

  // Reset form when dialog closes/opens
  useEffect(() => {
    if (open) {
      setMessages(INITIAL_MESSAGES);
      setInputValue("");
      setImages([]);
      setError("");
      setIsPlanning(false);
      setIsChatting(false);
    }
  }, [open]);

  const addImages = (picked: PickedImage[]) => {
    if (picked.some(p => p.size < 0)) {
      setError(picked[0].name);
      return;
    }
    const nextImages = [...images, ...picked].slice(0, 6);
    const totalBytes = nextImages.reduce((sum, image) => sum + image.size, 0);
    if (totalBytes > MAX_TOTAL_IMAGE_BYTES) {
      setError("Those photos are over 10 MB combined. Remove one or choose smaller photos.");
      return;
    }
    setError("");
    setImages(nextImages);
  };

  const removeImage = (index: number) => {
    setImages(list => list.filter((_, i) => i !== index));
  };

  const handleSend = async () => {
    if (!inputValue.trim() || isChatting || isPlanning) return;
    const userText = inputValue.trim();
    setInputValue("");
    setError("");
    const newMessages: Message[] = [...messages, { role: 'user', content: userText }];
    setMessages(newMessages);
    setIsChatting(true);

    try {
      const responseText = await onChat(newMessages);
      setMessages([...newMessages, { role: 'assistant', content: responseText }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chat failed. Please try again.");
      setInputValue(userText); // Restore input so they can retry
      setMessages(messages); // Revert the user message addition
    } finally {
      setIsChatting(false);
    }
  };

  const handlePlan = async () => {
    setError("");
    setIsPlanning(true);
    try {
      let finalMessages = [...messages];
      if (inputValue.trim()) {
        finalMessages.push({ role: 'user', content: inputValue.trim() });
        setMessages(finalMessages);
        setInputValue("");
      }
      await onPlan(
        finalMessages,
        images.map(img => img.dataUrl)
      );
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate meal plan. Please try again.");
    } finally {
      setIsPlanning(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={nextOpen => {
        if (!isChatting && !isPlanning) onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="max-w-md w-[calc(100%-1rem)] sm:rounded-[2rem] border-0 p-0 shadow-2xl flex flex-col h-[90dvh] sm:h-[80vh] overflow-hidden">
        <div className="bg-primary/5 p-4 sm:p-6 pb-4 border-b shrink-0 z-10">
          <DialogHeader>
            <div className="flex items-center gap-3 text-primary mb-1">
              <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Brain className="w-5 h-5" />
              </div>
              <DialogTitle className="text-2xl">Plan the Week</DialogTitle>
            </div>
            <p className="text-muted-foreground text-sm text-left">
              Chat to build a practical menu, or snap photos of what you have.
            </p>
          </DialogHeader>
        </div>

        {/* Chat Transcript Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-background flex flex-col min-h-0" data-testid="chat-transcript">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`} data-testid={`chat-message-${m.role}-${i}`}>
              <div className={`max-w-[90%] rounded-2xl px-4 py-2.5 text-[15px] shadow-sm leading-relaxed ${m.role === 'user' ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-card border border-border text-foreground rounded-bl-sm'}`}>
                {m.content}
              </div>
            </div>
          ))}
          {isChatting && (
            <div className="flex justify-start" data-testid="status-chat-loading">
              <div className="bg-card border border-border text-foreground rounded-2xl rounded-bl-sm px-4 py-4 flex gap-1.5 items-center shadow-sm">
                <span className="w-1.5 h-1.5 bg-foreground/40 rounded-full animate-bounce" />
                <span className="w-1.5 h-1.5 bg-foreground/40 rounded-full animate-bounce delay-75" />
                <span className="w-1.5 h-1.5 bg-foreground/40 rounded-full animate-bounce delay-150" />
              </div>
            </div>
          )}
          <div ref={chatEndRef} className="h-1 shrink-0" />
        </div>

        {/* Input Area */}
        <div className="p-4 sm:p-6 bg-card border-t shrink-0 flex flex-col gap-4 z-10">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Kitchen Photos (Optional)
              </label>
            </div>
            <ImagePicker multiple onPick={addImages} />
            {images.length > 0 && (
              <div className="flex gap-2 overflow-x-auto py-2 -mx-2 px-2">
                {images.map((img, index) => (
                  <div key={`${img.name}-${index}`} className="relative shrink-0 group">
                    <img
                      src={img.dataUrl}
                      alt={`Kitchen photo ${index + 1}`}
                      className="h-14 w-14 rounded-xl object-cover border border-border shadow-sm"
                      data-testid={`img-plan-preview-${index}`}
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(index)}
                      className="absolute -right-2 -top-2 bg-foreground text-background w-5 h-5 flex items-center justify-center rounded-full opacity-100 transition-opacity shadow-sm"
                      aria-label={`Remove photo ${index + 1}`}
                      data-testid={`button-remove-plan-photo-${index}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="relative">
            <Textarea
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask for ideas, or describe your week..."
              maxLength={2_000}
              className="bg-background border-primary/20 rounded-xl resize-none min-h-[3rem] max-h-[8rem] text-sm focus-visible:ring-primary/40 focus-visible:border-primary pr-12 py-3"
              data-testid="textarea-chat-input"
              disabled={isChatting || isPlanning}
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!inputValue.trim() || isChatting || isPlanning}
              aria-label="Send meal-planning message"
              className="absolute right-2 bottom-2 w-8 h-8 flex items-center justify-center bg-primary text-primary-foreground rounded-lg disabled:opacity-50 transition-colors"
              data-testid="button-chat-send"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>

          {error && (
            <p
              role="alert"
              className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg"
              data-testid="status-plan-error"
            >
              {error}
            </p>
          )}

          <button
            type="button"
            disabled={isPlanning || isChatting}
            onClick={handlePlan}
            className="w-full min-h-[3rem] bg-primary text-primary-foreground font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors shadow-lg shadow-primary/25 disabled:opacity-70 disabled:cursor-not-allowed"
            data-testid="button-submit-plan"
          >
            {isPlanning ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Building your plan...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                Fill Empty Slots
              </>
            )}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
