import Link from "next/link";
import { Suspense } from "react";
import { UploadForm } from "@/components/course/upload-form";

async function UploadContent({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  return (
    <div className="space-y-6">
      <div>
        <Link href={`/courses/${courseId}`} className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          ← Derse dön
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Not yükle</h1>
      </div>
      <UploadForm courseId={courseId} />
    </div>
  );
}

export default function UploadPage({ params }: { params: Promise<{ courseId: string }> }) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Yükleniyor...</p>}>
      <UploadContent params={params} />
    </Suspense>
  );
}
