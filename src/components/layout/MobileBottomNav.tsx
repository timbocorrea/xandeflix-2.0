import { Home, Search, Settings, Tv } from 'lucide-react';

import { FocusableButton } from '../tv/FocusableButton';
import { FocusableSection } from '../tv/FocusableSection';

const mobileItems = [
  {
    label: 'Início',
    icon: Home,
    navId: 'mobile-home',
  },
  {
    label: 'Buscar',
    icon: Search,
    navId: 'mobile-search',
  },
  {
    label: 'Canais',
    icon: Tv,
    navId: 'mobile-channels',
  },
  {
    label: 'Ajustes',
    icon: Settings,
    navId: 'mobile-settings',
  },
];

export function MobileBottomNav() {
  return (
    <FocusableSection
      focusKey="mobile-bottom-nav-section"
      className="fixed bottom-0 left-0 right-0 z-40 grid h-20 grid-cols-4 border-t border-white/10 bg-black/95 px-2 pb-2 pt-2 md:hidden"
    >
      {mobileItems.map((item) => {
        const Icon = item.icon;

        return (
          <FocusableButton
            key={item.navId}
            focusKey={item.navId}
            className="flex flex-col items-center justify-center gap-1 rounded-xl text-xs font-semibold text-xf-muted"
            onEnterPress={() => {
              console.log(`[D-Pad] Mobile menu: ${item.label}`);
            }}
          >
            <Icon size={22} />
            <span>{item.label}</span>
          </FocusableButton>
        );
      })}
    </FocusableSection>
  );
}