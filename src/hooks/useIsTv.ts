import { useDeviceType } from './useDeviceType';

export function useIsTv() {
  const { isTv } = useDeviceType();

  return isTv;
}