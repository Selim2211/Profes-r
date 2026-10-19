"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import { deleteWeek } from "@/app/(app)/courses/actions";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

export function WeekDangerZone({ courseId, week }: { courseId: string; week: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex justify-end border-t pt-4 print:hidden">
      <Button variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => setOpen(true)}>
        <Trash2 />
        Haftayı sil
      </Button>
      <Modal open={open} onOpenChange={setOpen} title={`${week}. haftayı sil`} description="Haftadaki tüm dosyalar, çıkarılan metinler ve özetler silinecek. Bu geri alınamaz.">
        <form action={deleteWeek.bind(null, courseId, week)} className="flex gap-2">
          <Button type="submit" variant="destructive" className="flex-1">
            Evet, sil
          </Button>
          <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>
            Vazgeç
          </Button>
        </form>
      </Modal>
    </div>
  );
}
