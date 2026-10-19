"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { createCourse } from "@/app/(app)/courses/actions";
import { CourseForm } from "@/components/course/course-form";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

export function NewCourseButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button className={className} onClick={() => setOpen(true)}>
        <Plus />
        Yeni ders
      </Button>
      <Modal open={open} onOpenChange={setOpen} title="Yeni ders" description="Haftaları dersi oluşturduktan sonra ekleyeceksin.">
        <CourseForm action={createCourse} submitLabel="Dersi oluştur" />
      </Modal>
    </>
  );
}
