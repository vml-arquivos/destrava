import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface BenefitCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

export default function BenefitCard({
  icon: Icon,
  title,
  description,
}: BenefitCardProps) {
  return (
    <Card className="border-2 hover:border-primary transition-colors duration-300 hover:shadow-lg">
      <CardContent className="p-6">
        <div className="mb-4 inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10">
          <Icon className="h-7 w-7 text-primary" />
        </div>
        <h3 className="text-xl font-bold mb-2">{title}</h3>
        <p className="text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}
