import type React from 'react';
import { TreePine, Sparkles, Crown, Heart, Flower2, PartyPopper } from 'lucide-react';
import type { HolidayIcon } from '../services/holidayTheme';

export const HOLIDAY_ICONS: Record<HolidayIcon, React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>> = {
  TreePine, Sparkles, Crown, Heart, Flower2, PartyPopper,
};
