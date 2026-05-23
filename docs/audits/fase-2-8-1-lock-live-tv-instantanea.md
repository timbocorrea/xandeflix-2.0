# Fase 2.8.1 — Lock da Live TV instantânea

Status: congelada para próximas correções.

Contrato protegido:
- A página Canais ao Vivo deve hidratar imediatamente a partir do cache persistente.
- O loading/skeleton da Live TV só pode aparecer se não houver `liveTvChannels`.
- O bootstrap deve restaurar o cache persistente da Live TV quando houver resultado crítico salvo.
- Próximas correções de Home/capas não podem alterar:
  - `src/features/live/pages/LiveTvPage.tsx`
  - `src/features/live/services/liveTvCriticalCache.service.ts`
  - `src/features/bootstrap/services/appBootstrap.service.ts`

Validação obrigatória antes e depois das próximas fases:

```bash
bash scripts/guards/check-live-tv-instant-lock.sh

