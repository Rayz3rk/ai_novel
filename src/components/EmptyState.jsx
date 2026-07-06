import React from "react";
import { BookOpen } from "lucide-react";

export function EmptyState({ text }) {
  return (
    <div className="empty-state">
      <BookOpen size={20} />
      <span>{text}</span>
    </div>
  );
}
