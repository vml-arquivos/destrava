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
}

export default function CTAButton({
  href = "/simulacao",
  children,
  variant = "default",
  size = "lg",
  className = "",
  showArrow = true,
}: CTAButtonProps) {
  return (
    <Link href={href}>
      <Button
        variant={variant}
        size={size}
        className={`font-semibold ${className}`}
      >
        {children}
        {showArrow && <ArrowRight className="ml-2 h-5 w-5" />}
      </Button>
    </Link>
  );
}
