# Fase 3.14.2G — Live TV Mobile Preview Inline Congelado

## Status
Aprovado no celular.

## Estado aprovado
- Preview inline mobile fica abaixo dos botões Ao Vivo / Filmes / Séries.
- Preview não flutua ao rolar.
- Preview não sobrepõe os botões superiores.
- Preview não aumenta a largura da página.
- overflowX permanece 0.
- Canal MPEGTS continua reproduzindo via player nativo inline.
- Fundo cinza atrás/abaixo do vídeo foi removido.
- Painel temporário de diagnóstico foi removido.
- Botões Play/Pausar, Mudo/Som e Fullscreen permanecem funcionais e próximos do player.

## Arquivos críticos congelados
- src/features/live/pages/LiveTvPage.tsx
- src/features/player/lib/nativeAndroidPlayerBridge.ts
- android/app/src/main/java/com/xandeflix/app/NativeAndroidPlayerPlugin.java

## Regras de proteção
1. Não trocar preview MPEGTS mobile para WebView.
2. Não remover startNativeAndroidInlinePreview.
3. Não remover updateNativeAndroidInlinePreview.
4. Não remover updatePreview do plugin Java.
5. Não remover o controle isNativeInlinePreviewActive.
6. Não remover o hide do vídeo HTML quando o preview nativo inline estiver ativo.
7. Não alterar breakpoint min-[560px] sem teste em celular, tablet e Fire Stick.
8. Não alterar fullscreen nativo junto com ajustes de preview inline.
9. Antes de ajustar o botão Filmes, validar retorno para Ao Vivo com preview MPEGTS funcionando.

## Próxima prioridade
Ajustar funcionamento do botão "Filmes" no topo da página de Canais ao Vivo sem quebrar o estado congelado do preview Ao Vivo.
