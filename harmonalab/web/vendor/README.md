# SDK da Anthropic (cópia embutida)

`anthropic-sdk.js` é o [SDK oficial](https://github.com/anthropics/anthropic-sdk-typescript) (`@anthropic-ai/sdk`
**1.6.0**, licença Apache-2.0, veja `LICENSE`) empacotado em um único arquivo para rodar direto no navegador, sem CDN
e sem etapa de build no app. Só é carregado quando alguém usa o assistente de IA.

Para atualizar (precisa de Node.js), em uma pasta vazia fora do projeto:

```bash
npm init -y && npm install @anthropic-ai/sdk esbuild
printf 'import Anthropic from "@anthropic-ai/sdk";\nexport default Anthropic;\nexport { Anthropic };\n' > entry.mjs
npx esbuild entry.mjs --bundle --format=esm --platform=browser --minify --target=es2022 --legal-comments=none --outfile=anthropic-sdk.js
```

Depois copie `anthropic-sdk.js` (e o `LICENSE` do pacote) para esta pasta, atualize a versão acima e rode `python -m pytest`.
