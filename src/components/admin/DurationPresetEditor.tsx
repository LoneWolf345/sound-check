import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { X } from 'lucide-react';
import type { DurationPreset, DurationUnit } from '@/types';

interface DurationPresetEditorProps {
  preset: DurationPreset;
  onChange: (preset: DurationPreset) => void;
  onDelete: () => void;
  canDelete: boolean;
}

export function DurationPresetEditor({
  preset,
  onChange,
  onDelete,
  canDelete,
}: DurationPresetEditorProps) {
  return (
    <div className="flex items-center gap-2">
      <Input
        type="number"
        min={1}
        value={preset.value}
        onChange={(e) =>
          onChange({ ...preset, value: parseInt(e.target.value) || 1 })
        }
        className="w-20"
      />
      <Select
        value={preset.unit}
        onValueChange={(unit: DurationUnit) => onChange({ ...preset, unit })}
      >
        <SelectTrigger className="w-28">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="bg-popover">
          <SelectItem value="minutes">minutes</SelectItem>
          <SelectItem value="hours">hours</SelectItem>
          <SelectItem value="days">days</SelectItem>
        </SelectContent>
      </Select>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onDelete}
        disabled={!canDelete}
        className="h-9 w-9 text-muted-foreground hover:text-destructive"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
