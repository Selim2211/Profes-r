"use client";

import { Plus, Settings2 } from "lucide-react";
import { useActionState, useState } from "react";
import { createWeek, deleteCourse, updateCourse } from "@/app/(app)/courses/actions";
import { CourseForm } from "@/components/course/course-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";

type CourseState = { error?: string };

function WeekForm({ courseId, nextWeek }: { courseId: string; nextWeek: number }) {
  const [state, formAction, pending] = useActionState<CourseState, FormData>(createWeek.bind(null, courseId), {});
  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="weekNumber">Hafta numarası</Label>
        <Input id="weekNumber" name="weekNumber" type="number" min={1} max={52} inputMode="numeric" defaultValue={nextWeek} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="weekTitle">Başlık (opsiyonel)</Label>
        <Input id="weekTitle" name="title" placeholder="Örn. Laplace dönüşümü" />
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Oluşturuluyor..." : "Haftayı oluştur"}
      </Button>
    </form>
  );
}

export function AddWeekButton({ courseId, nextWeek }: { courseId: string; nextWeek: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus />
        Hafta ekle
      </Button>
      <Modal open={open} onOpenChange={setOpen} title="Yeni hafta" description="Haftayı oluşturunca notlarını içine yükleyebilirsin.">
        <WeekForm courseId={courseId} nextWeek={nextWeek} />
      </Modal>
    </>
  );
}

type CourseDefaults = { name: string; code: string | null; description: string | null };

export function CourseSettingsButton({ courseId, course }: { courseId: string; course: CourseDefaults }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <Button variant="outline" size="icon" className="size-10" aria-label="Ders ayarları" onClick={() => setOpen(true)}>
        <Settings2 />
      </Button>
      <Modal
        open={open}
        onOpenChange={(value) => {
          setOpen(value);
          if (!value) setConfirming(false);
        }}
        title="Ders ayarları"
      >
        <div className="space-y-6">
          <CourseForm action={updateCourse.bind(null, courseId)} submitLabel="Kaydet" defaults={course} />
          <div className="space-y-3 border-t pt-4">
            {confirming ? (
              <form action={deleteCourse.bind(null, courseId)} className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Ders, haftaları ve yüklediğin tüm notlar silinecek. Bu geri alınamaz.
                </p>
                <div className="flex gap-2">
                  <Button type="submit" variant="destructive" className="flex-1">
                    Evet, sil
                  </Button>
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setConfirming(false)}>
                    Vazgeç
                  </Button>
                </div>
              </form>
            ) : (
              <Button type="button" variant="destructive" className="w-full" onClick={() => setConfirming(true)}>
                Dersi sil
              </Button>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
