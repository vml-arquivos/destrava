import { Card, CardContent } from "@/components/ui/card";
import { Quote } from "lucide-react";

interface TestimonialCardProps {
  quote: string;
  author: string;
  role: string;
  company: string;
}

export default function TestimonialCard({
  quote,
  author,
  role,
  company,
}: TestimonialCardProps) {
  return (
    <Card className="h-full">
      <CardContent className="p-6">
        <Quote className="h-10 w-10 text-primary/30 mb-4" />
        <p className="text-foreground/90 mb-6 italic leading-relaxed">
          "{quote}"
        </p>
        <div className="border-t border-border pt-4">
          <p className="font-bold text-foreground">{author}</p>
          <p className="text-sm text-muted-foreground">
            {role} • {company}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
