import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const roleLabels: Record<string, string> = {
  vedouci: "Vedoucí",
  garant: "Garant",
  ziskatel: "Získatel",
  novacek: "Nováček",
};

interface PromotionModalProps {
  open: boolean;
  onClose: () => void;
  newRole: string;
}

export function PromotionModal({ open, onClose, newRole }: PromotionModalProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="text-center">
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl">
            🎉 Gratulujeme!
          </DialogTitle>
        </DialogHeader>
        <p className="font-body text-lg text-foreground py-4">
          Nyní je z tebe <strong>{roleLabels[newRole] || newRole}</strong>.
        </p>
        <DialogFooter className="justify-center">
          <Button onClick={onClose} className="btn btn-primary btn-md">
            Pokračovat
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
