# Relatório — Estabilização Admin/Licenciamento/Dispositivos

## Contexto

Esta fase estabilizou a regra de autorização por dispositivo no Xandeflix 2.0.

Problema original:
- a licença sozinha permitia ativação em novos dispositivos;
- dispositivos reinstalados geravam novos identificadores;
- o Admin não mostrava claramente os dispositivos autorizados por licença;
- a aba Dispositivos usava devices, enquanto a autorização real passou a depender de license_devices;
- dispositivos antigos/ociosos não tinham fluxo operacional seguro para limpeza.

## Regra consolidada

A licença não deve autorizar sozinha um dispositivo.

A autorização real passa a depender de:

- licenseCode;
- deviceIdentifier;
- vínculo prévio em license_devices;
- status ativo do vínculo.

Dispositivo não pré-autorizado deve ser bloqueado com erro equivalente a DEVICE_NOT_PREAUTHORIZED.

## Funções Supabase envolvidas

### activate-license

Foi ajustada para validar se o dispositivo está previamente autorizado para a licença.

Resultado esperado:
- dispositivo não vinculado: bloqueado;
- dispositivo vinculado: ativação permitida.

### create-license-device

Função administrativa criada para pré-vincular dispositivos a uma licença.

Uso esperado:
- Admin seleciona licença;
- informa deviceIdentifier, nome e plataforma;
- cria/atualiza vínculo em license_devices.

### list-license-devices-admin

Função administrativa criada para listar dispositivos autorizados com metadados operacionais.

Retorna:
- dados do dispositivo;
- licença;
- cliente;
- vigência;
- plano inferido;
- status operacional;
- indicação de removibilidade.

Status operacional:
- active: acesso recente;
- idle: ocioso/inativo;
- inactive: vínculo desativado;
- expired: vencido.

## Admin — Licenças

A tela de Licenças passou a permitir:

- abrir detalhes da licença;
- visualizar dispositivos vinculados à licença;
- pré-vincular novo dispositivo;
- confirmar se o ID atual do aparelho está autorizado naquela licença.

## Admin — Dispositivos

A tela de Dispositivos passou a ter uma seção de dispositivos autorizados por licença.

Melhorias adicionadas:
- listagem baseada em license_devices;
- destaque por status operacional;
- filtro por status;
- seleção por linha;
- seleção de todos os visíveis;
- desmarcação manual;
- exclusão em lote exatamente dos dispositivos selecionados;
- contador de selecionados;
- remoção visual após exclusão.

A seção antiga baseada em devices foi mantida como cadastro legado.

## Validações executadas

- TypeScript validado com npx.cmd --no-install tsc -b;
- build web validado com npx.cmd --no-install vite build;
- app Android corrigido para não cair em https://localhost/ quando empacotado;
- ID atual do tablet identificado via Configurações;
- pré-vínculo validado pelo Admin;
- seleção/exclusão em lote validada visualmente pelo usuário.

## Observações críticas

A licença de teste chegou a mostrar contagem acima do limite, exemplo histórico 55/1.

Isso indica resíduo de ativações anteriores à regra nova.

A limpeza em lote ajuda a remover vínculos antigos, mas a política de limite por licença ainda deve ser auditada em fase própria para:
- impedir overbooking;
- revisar dispositivos ativos por licença;
- tratar reinstalação/troca de aparelho;
- definir regra de reativação por suporte.

## Riscos remanescentes

1. A branch atual também contém alterações de Player/Android/VOD.
2. Admin/licenciamento e Player/Android estão misturados na mesma branch.
3. Antes do merge, é recomendável decidir se tudo entra em uma PR única de estabilização ampla ou se a branch será dividida em PRs separadas.
4. Os arquivos brutos de diagnóstico foram removidos desta fase para evitar poluir o repositório.
5. As funções Supabase novas precisam estar presentes na PR:
   - supabase/functions/create-license-device/index.ts;
   - supabase/functions/list-license-devices-admin/index.ts.

## Próximos testes necessários

1. Testar ativação no app com dispositivo vinculado.
2. Testar bloqueio de dispositivo não vinculado.
3. Testar carregamento de lista.
4. Testar player Live TV.
5. Testar player VOD/filmes.
6. Confirmar se erros HTTP 404 são origem de lista/provedor ou bug do player.
7. Auditar se a PR deve ser dividida.
