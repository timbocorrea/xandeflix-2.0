# Data Governance Guardrails

## 1. Finalidade

Este documento define as travas de governança para impedir expansão acidental do modelo legado de catálogo IPTV/TMDB centralizado no Supabase.

A regra central é:

> Supabase controla acesso. Dispositivo do usuário controla catálogo.

## 2. Escopo protegido

As regras se aplicam a qualquer alteração que envolva:

- catálogo IPTV/VOD;
- fonte Xtream/M3U;
- TMDB;
- URLs de stream;
- grupos reais da fonte;
- importadores;
- cache de catálogo;
- funções Supabase;
- migrations;
- telas que consomem catálogo.

## 3. Permitido

É permitido criar ou alterar:

- documentação de governança;
- ADRs;
- PRDs;
- scripts de guardrail;
- workflows de validação;
- inventários de legado;
- plano de refatoração local-first;
- camada local-first futura, desde que aprovada em fase própria.

## 4. Proibido sem aprovação explícita

É proibido introduzir ou ampliar, fora de exceção aprovada:

- persistência centralizada de catálogo IPTV/VOD no Supabase;
- `stream_url` real;
- `playlist_url` real;
- `group_title` real da fonte;
- `tvg_id` real;
- `logo_url` real da fonte;
- nomes/títulos reais da fonte em backend central;
- metadados TMDB vinculados ao item IPTV em backend central;
- `poster_path` e `backdrop_path` vinculados a catálogo IPTV central;
- novas migrations para catálogo IPTV/TMDB central;
- execução de warmup/enrichment TMDB centralizado;
- deleção de legado antes do inventário e substituto local-first.

## 5. Legado congelado

Arquivos existentes que já contenham dependência do modelo antigo devem ser tratados como:

`LEGACY_ALLOWED_BUT_FROZEN`

Regras do legado congelado:

- não limpar nesta fase;
- não deletar sem inventário;
- não expandir;
- não usar como base para novas funcionalidades;
- substituir gradualmente por local-first em fases futuras.

## 6. Guardrail automatizado

O script `scripts/guardrails/check-data-governance.mjs` analisa o diff da branch contra `origin/main`, quando disponível.

Ele ignora áreas permitidas de governança:

- `docs/product/`
- `docs/architecture/`
- `docs/governance/`
- `scripts/guardrails/`
- `.github/pull_request_template.md`

Para arquivos fora dessa whitelist, o script bloqueia linhas adicionadas que introduzam padrões proibidos.

## 7. Modo warning local

Para diagnóstico local, é possível executar:

```bash
DATA_GOVERNANCE_ALLOW_LEGACY=1 npm run governance:check
```

Esse modo apenas imprime warnings quando não estiver em CI.

No CI, violações devem falhar mesmo que a variável esteja configurada.

## 8. Política para Pull Requests

Todo PR deve declarar:

- se toca catálogo;
- se toca Supabase;
- se toca stream/fonte;
- se toca TMDB;
- se altera player;
- se altera Android nativo;
- se altera D-pad;
- se respeita o modelo local-first.

## 9. Critério de bloqueio

Uma PR deve ser bloqueada se:

- amplia o legado centralizado;
- altera `src/`, `supabase/functions`, Android ou player fora do escopo aprovado;
- cria migration funcional sem autorização;
- executa ou prepara warmup TMDB centralizado;
- tenta remover legado sem inventário;
- não roda `npm run governance:check`.

## 10. Próximas fases previstas

Após esta fase, a ordem recomendada é:

1. inventariar legado IPTV/TMDB;
2. criar camada local-first substituta em paralelo;
3. migrar uma tela por vez;
4. validar Fire Stick quando envolver TV/D-pad;
5. só depois desativar/purgar legado com aprovação explícita.
