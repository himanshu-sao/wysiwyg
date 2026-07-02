import React from "react";

interface CardProps {
  title: string;
  description: string;
  variant?: "primary" | "secondary";
}

const Card: React.FC<CardProps> = ({ title, description, variant = "primary" }) => {
  const baseClasses = "p-6 rounded-lg shadow-md transition-shadow";
  const variantClasses = {
    primary: "bg-white border border-gray-200 hover:shadow-lg",
    secondary: "bg-gray-50 border border-gray-300 hover:shadow-xl",
  };

  return (
    <div className={`${baseClasses} ${variantClasses[variant]}`}>
      <h3 className="text-xl font-semibold mb-2">{title}</h3>
      <p className="text-gray-600">{description}</p>
    </div>
  );
};

export default Card;
