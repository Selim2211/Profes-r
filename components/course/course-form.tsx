"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type CourseState = { error?: string };

type Props = {
  action: (prev: CourseState, formData: FormData) => Promise<CourseState>;
  submitLabel: string;
  defaults?: { name?: string; code?: string | null; description?: string | null };
};

export function CourseForm({ action, submitLabel, defaults }: Props) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Ders adı</Label>
        <Input id="name" name="name" required defaultValue={defaults?.name} className="h-11" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="code">Ders kodu (opsiyonel)</Label>
        <Input id="code" name="code" defaultValue={defaults?.code ?? ""} className="h-11" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Açıklama (opsiyonel)</Label>
        <Textarea id="description" name="description" defaultValue={defaults?.description ?? ""} />
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" className="h-11" disabled={pending}>
        {pending ? "Kaydediliyor..." : submitLabel}
      </Button>
    </form>
  );
}
