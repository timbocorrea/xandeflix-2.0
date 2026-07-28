# U2-F2 — Ciclo 5B2 — Separação de transporte

## Política resultante

- Android/Capacitor: conexão direta com a fonte por `fetch`, usando a integração HTTP nativa configurada no Capacitor.
- Navegador em desenvolvimento: proxy local do processo Node/Vite, disponível apenas durante `vite serve`.
- Navegador em produção: conexão direta com a fonte e sujeita à política CORS do servidor de origem.
- Supabase: não participa do transporte de playlist ou catálogo.
- Edge Function remota `playlist-proxy`: permanece implantada, mas não possui chamada no frontend deste ciclo.

## Segurança do proxy local

- endpoint disponível apenas no servidor de desenvolvimento;
- requisições de navegador precisam ser da mesma origem;
- corpo limitado;
- somente URLs HTTP/HTTPS;
- somente métodos upstream GET/HEAD;
- URL da fonte enviada no corpo e não na query string;
- nenhum log da URL ou do conteúdo;
- fechamento do cliente cancela a requisição upstream.

## Cancelamento

O `AbortSignal` do runtime é propagado ao transporte direto ou ao proxy local. Cancelamento do usuário e timeout são classificados separadamente.

## Fora de escopo

- remoção ou redeploy da Edge Function remota;
- player;
- snapshots v3;
- importação em background;
- paginação do catálogo;
- alteração das flags.
