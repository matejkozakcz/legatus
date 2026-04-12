import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipientId: string;
  recipientName: string;
}

const TEMPLATES = [
  { id: "custom", label: "Vlastní zpráva", title: "", message: "" },
  {
    id: "odb",
    label: "Osobní databáze kontaktů",
    title: "Osobní databáze kontaktů",
    message: "Připrav si svou osobní databázi kontaktů.",
  },
  {
    id: "analyza",
    label: "Analýza trhu",
    title: "Analýza trhu",
    message: "Zpracuj analýzu trhu do stanoveného termínu.",
  },
  { id: "fsa", label: "FSA schůzka", title: "FSA schůzka", message: "Naplánuj a absolvuj FSA schůzku." },
  { id: "pohovor", label: "Pohovor", title: "Pohovor", message: "Připrav se na pohovor." },
  {
    id: "servis",
    label: "Servisní schůzka",
    title: "Servisní schůzka",
    message: "Naplánuj servisní schůzku s člověkem.",
  },
];

export function CreateNotificationDialog({ open, onOpenChange, recipientId, recipientName }: Props) {
  const { profile } = useAuth();
  const [templateId, setTemplateId] = useState("custom");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [deadline, setDeadline] = useState("");
  const [sending, setSending] = useState(false);

  const handleTemplateChange = (id: string) => {
    setTemplateId(id);
    const tpl = TEMPLATES.find((t) => t.id === id);
    if (tpl && id !== "custom") {
      setTitle(tpl.title);
      setMessage(tpl.message);
    }
  };

  const handleSend = async () => {
    if (!title.trim() || !deadline || !profile?.id) {
      toast.error("Vyplň název a deadline.");
      return;
    }

    setSending(true);
    try {
      // Insert notification
      const { data: notif, error } = await supabase
        .from("notifications")
        .insert({
          sender_id: profile.id,
          recipient_id: recipientId,
          title: title.trim(),
          message: message.trim(),
          deadline,
        })
        .select("id")
        .single();

      if (error) throw error;

      // Trigger push notification via edge function
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      fetch(`https://${projectId}.supabase.co/functions/v1/send-push`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${anonKey}`,
        },
        body: JSON.stringify({ notification_id: notif.id }),
      }).catch(() => {
        /* push is best effort */
      });

      toast.success(`Upozornění odesláno pro ${recipientName}`);
      onOpenChange(false);
      setTemplateId("custom");
      setTitle("");
      setMessage("");
      setDeadline("");
    } catch (err: any) {
      toast.error("Nepodařilo se odeslat upozornění.");
      console.error(err);
    } finally {
      setSending(false);
    }
  };

  // Minimum deadline = today
  const today = new Date().toISOString().split("T")[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nové upozornění</DialogTitle>
          <DialogDescription>Odešli upozornění pro {recipientName}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Šablona</Label>
            <Select value={templateId} onValueChange={handleTemplateChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TEMPLATES.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Název</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Název úkolu" />
          </div>

          <div className="space-y-2">
            <Label>Zpráva</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Volitelná zpráva..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>Deadline</Label>
            <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} min={today} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Zrušit
          </Button>
          <Button onClick={handleSend} disabled={sending || !title.trim() || !deadline}>
            {sending ? "Odesílám..." : "Odeslat"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
