import React, { ReactNode } from "react";

interface FeatureCardProps {
  icon?: ReactNode;
  title: string;
  description: string;
  accent?: "primary" | "secondary";
  className?: string;
  badge?: string;
}

/**
 * Feature card with soft styling and hover effects.
 * Playful but premium — subtle animations, readable hierarchy.
 */
export function FeatureCard({
  icon,
  title,
  description,
  accent = "primary",
  className = "",
  badge,
}: FeatureCardProps) {
  const accentBg =
    accent === "primary"
      ? "bg-primary-light"
      : "bg-secondary-light";
  const accentBorder =
    accent === "primary"
      ? "border-primary-base"
      : "border-secondary-base";

  return (
    <div
      className={`
        group card-hover
        p-6 rounded-lg bg-white border border-border-light
        transition-all duration-300
        hover:shadow-soft-md
        ${className}
      `}
    >
      {/* Badge (optional) */}
      {badge && (
        <span className="inline-block mb-3 px-2.5 py-1 text-xs font-semibold text-primary-base bg-primary-light rounded-full">
          {badge}
        </span>
      )}

      {/* Icon */}
      {icon && (
        <div
          className={`
            w-12 h-12 mb-4 p-3 rounded-lg flex items-center justify-center
            ${accentBg} ${accentBorder} text-primary-base
            transition-transform duration-300 group-hover:scale-110
          `}
        >
          {icon}
        </div>
      )}

      {/* Title */}
      <h3 className="text-xl font-semibold text-text-primary mb-2 group-hover:text-primary-base transition-colors">
        {title}
      </h3>

      {/* Description */}
      <p className="text-sm text-text-secondary leading-relaxed">
        {description}
      </p>

      {/* Optional bottom accent line */}
      <div className="mt-4 h-0.5 w-0 bg-gradient-to-r from-primary-base to-secondary-base rounded-full transition-all duration-300 group-hover:w-8" />
    </div>
  );
}
