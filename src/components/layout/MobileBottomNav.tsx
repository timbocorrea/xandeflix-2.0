import { Home, Search, Settings, Tv } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { spatialDebug } from '@/lib/spatial/spatialDebug';
import { FocusableButton } from '../tv/FocusableButton';
import { FocusableSection } from '../tv/FocusableSection';

const mobileItems = [
  {
    label: 'Início',
    icon: Home,
    navId: 'mobile-home',
    path: '/',
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
    path: '/live',
  },
  {
    label: 'Ajustes',
    icon: Settings,
    navId: 'mobile-settings',
  },
];

export function MobileBottomNav() {
  const navigate = useNavigate();

  return (
    <FocusableSection
      focusKey="mobile-bottom-nav-section"
      className="fixed bottom-0 left-0 right-0 z-40 grid h-20 grid-cols-4 border-t border-white/10 bg-black/95 px-2 pb-2 pt-2"
    >
      {mobileItems.map((item) => {
        const Icon = item.icon;

        const handlePress = () => {
          if (item.path) {
            navigate(item.path);
            return;
          }

          spatialDebug('sidebar', 'Mobile menu:', item.label);
        };

        return (
          <FocusableButton
            key={item.navId}
            focusKey={item.navId}
            className="flex flex-col items-center justify-center gap-1 rounded-xl text-xs font-semibold text-xf-muted"
            onEnterPress={handlePress}
            onClick={handlePress}
          >
            <Icon size={22} />
            <span>{item.label}</span>
          </FocusableButton>
        );
      })}
    </FocusableSection>
  );
}
