import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function HomePage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Ana sayfa</h1>
      <Card>
        <CardHeader>
          <CardTitle>Başlayalım</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Önce bir ders oluştur, sonra notlarını yükle.{" "}
          <Link href="/courses" className="underline underline-offset-4">
            Derslerime git
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
