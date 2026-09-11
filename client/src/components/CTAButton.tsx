import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ArrowRight } from "lucide-react";

interface CTAButtonProps {
  href?: string;
  children: React.ReactNode;
  variant?: "default" | "secondary" | "outline";
  size?: "default" | "sm" | "lg";
  className?: string;
  showArrow?: boolean;
  ctaPosition?: string;
}

export default function CTAButton({
  href = "/simular",
  children,
  variant = "default",
  size = "lg",
  className = "",
  showArrow = true,
  ctaPosition = "conteudo",
}: CTAButtonProps) {
  return (
    <Button asChild variant={variant} size={size} className={`font-semibold ${className}`}>
      <Link href={href} data-cta-position={ctaPosition}>
        {children}
        {showArrow && <ArrowRight className="ml-2 h-5 w-5" />}
      </Link>
    </Button>
  );
}
