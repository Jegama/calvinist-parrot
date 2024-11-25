'use client';

import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type Commentary = {
  id: string;
  name: string;
};

type SidebarProps = {
  commentaries: Commentary[];
  selectedCommentary: string;
  onCommentaryChange: (value: string) => void;
};

export default function Sidebar({ commentaries, selectedCommentary, onCommentaryChange }: SidebarProps) {
  return (
    <div className="w-64 h-full bg-background border-r p-4">
      <h2 className="text-lg font-semibold mb-4">Select Commentary</h2>
      <Select value={selectedCommentary} onValueChange={onCommentaryChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select a commentary" />
        </SelectTrigger>
        <SelectContent>
          {commentaries.map((commentary) => (
            <SelectItem key={commentary.id} value={commentary.id}>
              {commentary.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

