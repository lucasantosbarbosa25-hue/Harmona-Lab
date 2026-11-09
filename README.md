<p align="center"><img src="harmonalab/web/icon.svg" alt="Harmona Lab" width="120"></p>

# Harmona Lab

Laboratório de **voicings, reharmonização e condução de vozes** que transforma exatamente as notas que você
discutiu — mão esquerda, mão direita, oitavas, ponta — num arquivo **`.mid`** para arrastar em qualquer DAW
(Studio One, Ableton, Logic, Reaper…) e tocar com qualquer VST (Pianoteq, Kontakt, Rhodes, strings, synth).

> Foco desta primeira versão (MVP): **os voicings exatos que surgem nas conversas de harmonia viram MIDI, sem
> surpresas** — notas, oitavas, durações, BPM e ordem iguais ao que foi digitado.

É um **app web instalável** (PWA): abre no navegador, instala no celular ou no computador como um app, funciona
**sem internet** e **sem login**. Tudo roda no próprio aparelho — nada é enviado para servidor nenhum.

---

## Publicar e instalar no celular

O app é só um conjunto de arquivos estáticos (`harmonalab/web/`). Para ter um endereço `https://` (exigência do
celular para instalar) e poder compartilhar, publique no **Cloudflare Pages** — grátis, sem login para quem usa e com
endereço próprio: **https://harmona-lab.pages.dev**.

**Uma vez só, no painel da Cloudflare:** *Workers & Pages → Create* → escolha **Pages** (não Worker) →
*Import an existing Git repository*. Se o painel abrir direto na criação de um Worker, procure o link para Pages
(“Looking to deploy Pages?”).

| Campo | Valor |
|---|---|
| Repositório | `harmona-lab` |
| Nome do projeto | `harmona-lab` — vira o endereço `harmona-lab.pages.dev` |
| Branch de produção | `main` |
| Framework preset | *None* |
| Build command | *(vazio)* |
| Build output directory | `harmonalab/web` |
| Root directory | *(vazio)* |

Se o repositório não aparecer na lista, o app do GitHub da Cloudflare ainda não tem acesso a ele: o próprio painel
oferece o link para liberar (*Configure GitHub* / *Add repository*). Se o nome `harmona-lab` já estiver em uso por
outra pessoa, a Cloudflare acrescenta um sufixo; o painel mostra o endereço final.

Daí em diante, todo `git push` na `main` publica sozinho (o `wrangler.jsonc` diz o que publicar). Outras branches
ganham um endereço de prévia próprio, bom para testar antes.

Se o painel mostrar *“This project is disconnected from your Git account”* e os deploys pararem, o app do GitHub da
Cloudflare perdeu o acesso: em https://github.com/settings/installations abra *Cloudflare Workers & Pages → Configure*,
liberte o repositório e salve. O próximo `git push` na `main` volta a publicar.

Sem painel, dá para publicar à mão, na pasta do projeto: `npx wrangler login && npx wrangler pages deploy`.

**Endereço próprio (opcional).** Para algo como `harmonalab.app` ou `harmonalab.com.br`, registre o domínio (a
Cloudflare vende a preço de custo; `.com.br` sai no Registro.br) e, no projeto do Pages, use *Custom domains → Set up
a domain*. O custo é só o do domínio, por ano; a hospedagem continua grátis.

**Compartilhar com amigos.** Basta mandar o endereço. Cada pessoa instala no próprio aparelho, e os projetos de cada
um ficam só nesse aparelho: nada vai para servidor e ninguém vê o que o outro criou. Para trocar progressões, use
*Salvar projeto (.json)* e *Abrir* / *Colar JSON*.

**Instalar:** abra o endereço no celular.
- **Android (Chrome):** menu ⋯ do app → *Instalar como app* (ou menu do Chrome → *Instalar app*).
- **iPhone (Safari):** botão Compartilhar → *Adicionar à Tela de Início*.
- **Computador (Chrome/Edge):** ícone de instalar na barra de endereço.

Depois disso ele abre pelo ícone, em tela cheia, e funciona offline. Atualizações chegam sozinhas: a versão nova
aparece na próxima vez que o app for aberto com internet.

**E um APK?** Não é necessário: o app instalado já tem ícone, tela cheia e modo offline. Se um dia quiser um APK
(por exemplo, para a Play Store), o [PWABuilder](https://www.pwabuilder.com) gera um a partir do endereço publicado,
sem reescrever nada.

---

## Usar no computador sem publicar

Precisa de **Python 3.10+**. A única dependência é o [`mido`](https://mido.readthedocs.io).

**Windows** — dê dois cliques em `iniciar-windows.bat`.
**macOS / Linux** — rode `./iniciar-mac-linux.sh`.

Na primeira vez o script cria um ambiente isolado (`.venv`) e instala o `mido`; depois só abre o app.
Se preferir fazer à mão:

```bash
git clone https://github.com/lucasantosbarbosa25-hue/harmona-lab.git
cd harmona-lab
python -m venv .venv
# Windows: .venv\Scripts\activate      macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python -m harmonalab            # abre http://127.0.0.1:8765 no navegador
```

Para encerrar: `Ctrl+C` no terminal.

O servidor local só entrega os arquivos do app (a lógica roda no navegador). Com
`python -m harmonalab serve --host 0.0.0.0` dá para abrir pelo celular na mesma rede Wi‑Fi, mas sem `https` o
celular não instala o app — para isso, publique (seção acima).

---

## Pedir a harmonia à sua IA (texto ou voz)

O app é para **aprender harmonia rebuscada** (Jesús Molina, Dirty Loops, Domi & JD Beck, Stevie Wonder, Ed Motta e afins):
quem monta a progressão e **explica a função de cada acorde** (escala, empréstimo modal, cromatismo, substituição) é a
**sua IA**, no seu chat. O app confere as notas, mostra tom, referências, função e escala em cada acorde, e deixa você
mexer nos voicings. Não há chave de API, servidor nem custo.

**Jeito mais simples (uma vez):** em **Uso sempre a mesma IA**, copie as instruções e cole nas instruções permanentes da
sua IA (no Claude, num Projeto; no ChatGPT, em Personalizar ou num GPT; no Gemini, num Gem). Depois é só pedir no chat,
sem copiar nada: *“8 acordes, 76 BPM, estilo Jesús Molina, ponta descendo de F# até C, baixo em pedal de E”*. A IA responde
com a explicação acorde a acorde e **um link**: toque nele e a progressão abre no app, conferida.

**Sem configurar nada:** escreva ou dite (🎤) o pedido no cartão do topo e use **Copiar pedido para a IA**; cole no chat,
e depois toque no link que ela mandar ou cole a resposta no passo 3. Se a conferência achar problema, o app mostra a lista
e copia o texto de correção para você colar na mesma conversa. **Ajustar a atual** pede mudanças na progressão da tela.

**Links.** O que vem depois do `#` nunca vai para servidor.
- `#t=…&k=Em&bpm=80&p=cifra:notas:duração:função:escala;…`: o formato compacto que qualquer IA consegue escrever
  (descrito em [`/ia.md`](harmonalab/web/ia.md), que também serve para IAs com navegação: “leia …/ia.md e monte…”).
- `#z=…`: a progressão comprimida, o link mais curto. **⋯ → Copiar link da progressão** gera um para você mandar a um amigo.
- `#json=…` (o projeto) e `#pedido=…` (só preenche o pedido; o app nunca gera sozinho ao abrir um link).

**Voicings à mão.** Em cada acorde, **Voicing da mão direita**: Fechado, Aberto, Drop 2 e Drop 3. Em **Mexer nos voicings de
todos os acordes**, os mesmos botões valem para a progressão inteira, e a **ponta pedal** põe a mesma nota no topo de todos
os acordes (o app avisa em quantos ela não fazia parte do acorde: é a tensão que você vai ouvir). Só mudam as oitavas da
mão direita; tudo pode ser desfeito.

**Skill para o Claude.** A pasta [`skill/harmona-harmonia`](skill/harmona-harmonia) (e o `.zip` em
`harmonalab/web/harmona-harmonia.zip`, que o app oferece para baixar) é uma skill: instruções, vocabulário de harmonia no
estilo de livros-texto (modos da menor melódica, tensões, substituições, upper structures, voicings), pistas por artista,
um exemplo completo de resposta e dois scripts (`validar.py` confere as notas e a ponta; `gerar_link.py` gera o link).
Para acrescentar material de estudo próprio (apostilas, anotações de aula), coloque em `references/` e cite no `SKILL.md`.

O ditado usa o reconhecimento de voz do próprio navegador (Chrome, Edge, Safari recentes; precisa de internet).

## Como usar

1. Ajuste **BPM**, **compasso**, **velocity padrão** e a convenção do **dó central**.
2. Em cada acorde, digite as notas da **mão direita** e da **mão esquerda** com oitava: `D4 Eb4 G4 C5`.
   O teclado e as fichas logo abaixo mostram, em tempo real, exatamente o que vai para o MIDI
   (do grave ao agudo, com o número MIDI de cada nota e a **ponta** destacada).
3. Escolha a duração (`½`, `1` ou `2` compassos, ou qualquer número de tempos).
4. **▶ Ouvir** faz uma pré‑escuta simples no navegador (só para conferir; o som de verdade é o do seu VST).
5. **Gerar MIDI** salva o `.mid`. Arraste o arquivo para uma faixa de instrumento na DAW.

Outras coisas na tela:

| Recurso | O que faz |
|---|---|
| **Ponta travada** | Declara a nota que *precisa* ser a mais aguda (a ponta, ou soprano). Se outra nota ficar acima (ou ela faltar), aparece um aviso. O botão **Travar** fixa o soprano atual. |
| **Strum** | Em vez de todas as notas juntas, cada nota entra uma após a outra: **grave → agudo** ou **agudo → grave**, com **10, 20 ou 30 ms** (ou outro valor, de 1 a 250) entre elas. A 1ª nota entra no tempo e o acorde termina no mesmo instante, então nada se desloca. Fica **desligado** por padrão: assim o MIDI sai exatamente como digitado. Vale para o projeto todo, e cada acorde pode trocar em **Mais → Strum deste acorde**. A pré‑escuta (**▶**) usa os mesmos atrasos. |
| **Mais: baixo/pedal, notas sem mão** | Notas extras que soam junto (ex.: pedal de `E1` sob o acorde, ou notas sem mão definida). |
| **Notas omitidas / comentário** | Só anotação (não vão para o MIDI). |
| **+ Pausa** | Compasso de silêncio (útil para comparar ideias). |
| **Duplicar / mover / remover** | Remover e trocar de projeto têm **Desfazer**. |
| **Menu ⋯** | Abrir/salvar projeto `.json`, **colar JSON** (ex.: resposta do ChatGPT), exemplo, projeto novo. |

O trabalho fica salvo automaticamente no aparelho (rascunho); para guardar de verdade ou levar para outro aparelho,
use **Salvar projeto**.

**Do celular para a DAW:** o `.mid` vai para a pasta Downloads; mande para o computador como preferir (Drive,
WhatsApp, e‑mail, cabo). Quando o sistema permite compartilhar o arquivo, aparece o botão **Enviar** logo após gerar.

### Erros e avisos

- **Erro** (vermelho) impede gerar o MIDI: nota que não existe (`H3`), nota sem oitava (`Eb`), fora de 0–127,
  BPM/duração/velocity inválidos.
- **Aviso** (amarelo) e **nota** (cinza) nunca bloqueiam: ponta travada que não é a nota mais aguda, mesma tecla
  digitada duas vezes, mãos cruzadas, mão abrindo mais que uma 10ª, nota fora do piano de 88 teclas.

**Notas explícitas sempre mandam.** Clusters, semitons, baixos inesperados, acordes sem nome: tudo é exportado
exatamente como digitado. O nome do acorde é só um rótulo (vai como marcador no MIDI) — o programa não depende de
reconhecê‑lo.

---

## Convenção de oitavas (importante)

Internamente tudo é **número MIDI** (0–127). Na tela, o padrão é o **científico: MIDI 60 = C4** (dó central).

| Tecla | MIDI | Científico (padrão) | Ableton / Studio One / Cubase |
|---|---|---|---|
| Dó central | 60 | **C4** | **C3** |
| Lá 440 Hz | 69 | A4 | A3 |

Ableton Live e Studio One costumam **chamar a mesma tecla de C3**. Ou seja: você digita `C4` aqui e a DAW mostra
`C3` — é a mesma nota. Se preferir ver os nomes como na DAW, troque **Dó central** para `C3`: o app reescreve todos
os nomes e **as teclas exportadas continuam idênticas** (há teste automático garantindo isso).

Grafia: `C#4` e `Db4` viram o mesmo número (61), mas a grafia que você escreveu é preservada na tela e no JSON.
Também valem `B#3` (= C4), `Cb4` (= B3), dobrados (`C##4`, `Cx4`, `Dbb4`), símbolos `♯ ♭` e o número MIDI direto (`60`).

---

## Na DAW

- O arquivo é MIDI **tipo 0** (uma faixa), canal 1, **480 ticks por semínima**, com BPM e fórmula de compasso.
- Cada acorde vira *note on* no início e *note off* exatamente no fim. Nota comum entre dois acordes é
  re‑articulada (o *note off* vem antes do *note on* no mesmo instante — nada fica cortado ou pendurado).
- **BPM:** algumas DAWs não mudam o andamento do projeto ao importar um `.mid`. As notas estão em tempos musicais,
  então ficam certas nos compassos; ajuste o BPM do projeto se quiser o andamento do arquivo.
- Para conferir um `.mid` sem abrir a DAW: `python -m harmonalab inspect arquivo.mid` (use `--middle-c C3` para ver
  os nomes como no Ableton/Studio One).

---

## Formato do projeto (JSON)

A interface, a linha de comando e o gerador MIDI usam este mesmo modelo:

```json
{
  "title": "Resolução B7alt para Em com F# na ponta",
  "tempo": 80,
  "time_signature": "4/4",
  "middle_c": "C4",
  "default_velocity": 80,
  "chords": [
    {
      "symbol": "B7alt",
      "duration_beats": 4,
      "left_hand": ["B2", "A3"],
      "right_hand": ["D4", "Eb4", "G4", "C5"],
      "top_note": "C5",
      "velocity": 82,
      "comment": "C menor melódica a partir de B"
    }
  ]
}
```

| Campo | Obrigatório | Significado |
|---|---|---|
| `tempo` | não (80) | BPM (semínima), aceita decimais. |
| `time_signature` | não (`"4/4"`) | `"3/4"`, `"6/8"`, `"7/8"`… |
| `middle_c` | não (`"C4"`) | Como se chama o MIDI 60: `"C4"` ou `"C3"`. |
| `default_velocity` | não (80) | Usada quando o acorde não tem `velocity`. |
| `strum` | não (desligado) | `{"direction": "up", "delay_ms": 20}`. `direction`: `"off"`, `"up"` (grave → agudo) ou `"down"` (agudo → grave). `delay_ms`: 1 a 250 (padrão 20). Atalho: `"strum": "up"`. |
| `chords[].left_hand`, `right_hand` | não | Lista (`["B2","A3"]`) **ou** texto (`"B2 A3"`). Nomes com oitava ou números MIDI. |
| `chords[].bass`, `notes` | não | Baixo/pedal e notas sem mão definida. Também soam. |
| `chords[].duration_beats` | não (1 compasso) | Em tempos de semínima (4 = 1 compasso em 4/4; 3 = 1 compasso em 6/8). Ou use `duration_bars`. |
| `chords[].top_note` | não | Ponta travada (validação: deve ser a nota mais aguda). |
| `chords[].velocity` | não | 1–127. |
| `chords[].strum` | não (segue o projeto) | `"off"`, `"up"` ou `"down"`: troca o strum só neste acorde. O atraso é o do projeto. |
| `key`, `references` | não | Tom (`"Em"`) e artistas ou músicas de referência (lista): aparecem em destaque na progressão. |
| `chords[].function`, `scale` | não | Função em graus (`"V7alt"`) e escala ou modo: aparecem sob o nome do acorde. |
| `chords[].symbol`, `omitted`, `comment` | não | Informativos. |

Acorde sem nenhuma nota = pausa. Um exemplo completo está em
[`examples/resolucao_em_fsharp_ponta.json`](examples/resolucao_em_fsharp_ponta.json) (e o `.mid` gerado ao lado,
pronto para arrastar na DAW).

### Usando com o ChatGPT

O jeito mais fácil é o modo **Grátis, pelo seu chat** (seção “Descrever a progressão”), que monta o pedido
completo e confere a resposta. Para pedir à mão, peça a resposta já no formato do Harmona Lab, por exemplo:

> Responda só com um bloco JSON no formato Harmona Lab: `tempo`, `time_signature`, `middle_c: "C4"` e uma lista
> `chords`, cada um com `symbol`, `duration_beats`, `left_hand`, `right_hand` (notas com oitava, MIDI 60 = C4),
> `top_note` e `comment`.

Depois use **⋯ → Colar JSON**: o app aceita o JSON puro ou dentro de um bloco ```` ```json ```` com texto em volta.

---

## Linha de comando

```bash
python -m harmonalab                              # abre o app no navegador (igual a "serve")
python -m harmonalab serve --port 9000 --no-browser
python -m harmonalab export projeto.json          # gera projeto.mid (ou -o outro.mid)
python -m harmonalab check projeto.json           # mostra notas grave→agudo, MIDI, ponta, baixo e avisos
python -m harmonalab inspect arquivo.mid          # lista as notas de qualquer .mid
```

---

## Arquitetura

```
 linguagem natural / ChatGPT   (futuro: parser de texto livre — Fase 5)
              │
              ▼
   JSON do projeto  ◄──── interface web (web/app.js)        linha de comando (cli.py)
              │                                                     │
   ┌──────────┴─────── motor (mesmas camadas nos dois lados) ───────┴──────────┐
   │  model      projeto → acordes (notas concretas), leitura com lista de erros │
   │  analysis   ponta, baixo, espaçamento, avisos                               │
   │  pitch      nota = número MIDI + grafia original                            │
   │  midi       projeto → bytes do .mid                                         │
   └──────────────────────────────────────────────────────────────────────────────┘
      web/engine/*.js  (roda no navegador:            harmonalab/*.py  (referência, CLI
      app offline, sem servidor)          ◄── teste ──►  e testes; usa o mido)
                                          de paridade
```

Cada camada só conhece as de baixo. O gerador MIDI **não sabe nada** de interface, de texto livre nem de nomes de
acordes: recebe um projeto com notas concretas. Por isso dá para trocar a interface ou acrescentar um parser de
linguagem natural sem tocar no motor MIDI.

**Dois motores, um resultado.** O app roda o motor em JavaScript (`web/engine/`) para funcionar no celular, offline
e sem servidor. O motor em Python (`harmonalab/*.py`, com `mido`) continua sendo a referência testada e a base da
linha de comando. O teste `tests/test_js_parity.py` roda o motor JS no Node e exige, em dezenas de casos (inclusive
erros e casos de borda), **a mesma análise, as mesmas mensagens e os mesmos bytes de `.mid`** que o Python.

### Decisões e por quê

| Decisão | Motivo |
|---|---|
| **`mido`** para MIDI | Maduro, puro Python, controle direto de ticks e mensagens. O `pretty_midi` trabalha em segundos (ponto flutuante) e puxa `numpy`; aqui a fonte da verdade é o tempo musical. |
| **App web instalável (PWA)** em vez de APK | Mesmo código no celular e no computador, instala pelo navegador, atualiza sozinho, sem loja e sem login. |
| **Motor também em JavaScript**, conferido byte a byte com o Python | Funciona offline e sem servidor; o teste de paridade impede que as duas versões divirjam. |
| **HTML/CSS/JS puros** (sem build, sem npm) | Arquivos estáticos publicáveis em qualquer lugar; celular primeiro, tema claro/escuro automático. |
| **Servidor da biblioteca padrão** (`http.server`) | Só para usar no computador sem publicar: não precisa de Flask/FastAPI, banco de dados nem login. |
| **MIDI tipo 0, 480 ticks/♩, posições em ticks inteiros** | Importa igual em qualquer DAW; somar ticks inteiros evita deriva (4 tempos = 1920 ticks em qualquer BPM). |
| **Número MIDI canônico + grafia guardada à parte** | `C#4`/`Db4` soam igual mas aparecem como você escreveu. |

### Estrutura de diretórios

```
harmona-lab/
├── harmonalab/
│   ├── pitch.py        notas ↔ MIDI, convenções de oitava, grafia enarmônica
│   ├── model.py        Project / ChordEvent, leitura tolerante do JSON com lista de erros
│   ├── analysis.py     ponta, baixo, espaçamento, dobras, avisos musicais
│   ├── midi_io.py      gera .mid e lê de volta (conferência/testes)
│   ├── voicing.py      geradores automáticos — hoje: voicing fechado sob ponta travada
│   ├── server.py       servidor local que entrega o app (uso no computador)
│   ├── cli.py          linha de comando
│   └── web/            o app publicado (arquivos estáticos)
│       ├── index.html, styles.css, app.js   interface
│       ├── keyboard.js, audio.js            teclado visual e pré‑escuta
│       ├── engine/     motor em JS: pitch, model, analysis, midi (espelho do Python)
│       ├── ai/         assistente: instruções (prompt.js), pedido e resposta (chat.js), links (link.js),
│       │               conferência (check.js), ditado (speech.js) e tela (ui.js)
│       ├── ia.md       instruções para IAs (gerado por design/ia.mjs)
│       ├── harmona-harmonia.zip   a skill, para baixar (gerado por design/build_skill.py)
│       ├── manifest.webmanifest, sw.js, icons/   instalação e modo offline
│       └── example.json                    exemplo (cópia de examples/, conferida por teste)
├── design/             logo.mjs (ícones), ia.mjs (ia.md e SKILL.md), build_skill.py (cópia do motor e .zip da skill)
├── skill/harmona-harmonia/   a skill do Claude: SKILL.md, scripts, referências e exemplo
├── examples/           projeto de exemplo (.json) e o .mid gerado
├── tests/              testes automatizados (pytest) + js_engine_runner.mjs (paridade)
│   └── js/             testes do assistente (node --test), com a API da Anthropic simulada
├── wrangler.jsonc      publicação no Cloudflare Pages (só estáticos)
├── iniciar-windows.bat / iniciar-mac-linux.sh
├── requirements.txt    mido
└── requirements-dev.txt  + pytest
```

---

## Testes

```bash
pip install -r requirements-dev.txt
python -m pytest
```

Cobrem, entre outros: `C4 = 60`, `C#4 = Db4 = 61`, `B3 = 59`, `B#3`/`Cb4`, convenção C3; preservação da grafia;
leitura tolerante do JSON (todos os erros de uma vez); **top note**: com ponta `F#5`, nenhum voicing gerado
automaticamente passa de `F#5` (testado em todas as combinações de até 6 classes de altura); **duração**: 4 tempos em
4/4 = exatamente 1 compasso em vários BPMs, e outras fórmulas (3/4, 6/8, 5/4, 7/8); **MIDI relido do disco**:
pitches, note on/off, velocity, duração, ordem temporal, tempo, compasso, marcadores, nota comum re‑articulada,
pausas; **paridade JS × Python** (análise, mensagens e bytes do `.mid`, se houver Node.js instalado; sem Node o
teste é pulado); servidor local (inclusive bloqueio de caminhos fora da pasta do app); arquivos do modo offline e do
manifesto; linha de comando; **links** (formato compacto, `#json=` e `#z=` comprimido, links colados no meio de uma
resposta, links quebrados), **voicings** (fechado, aberto, drop 2, drop 3, ponta pedal, com propriedades sobre 400
acordes aleatórios), conferência da resposta da IA, ditado, e **a skill** (cópia do motor e `.zip` em dia, scripts, links
gerados em Python abrindo igual no app). Os testes em JavaScript rodam com `node --test tests/js` (e também pelo pytest).

---

## Próximas fases (onde cada coisa se encaixa)

Regra geral: recursos que o app usa entram no motor JS (`web/engine/`); o que também fizer sentido na linha de
comando entra no Python, e o teste de paridade ganha casos novos. Os nomes de arquivo abaixo valem para os dois lados.

**Fase 2 — projetos e comparação.** Abrir/salvar `.json` já existe. Falta: **comparação A/B** (função em `midi_io` ou
um módulo `arrange.py` que monta `contexto → alternativa → pausa`, repetindo N vezes, a partir de vários
`ChordEvent`), exportar várias alternativas de uma vez, e um banco de experimentos (pasta de `.json` com `name`,
`tags`, comentários e o `.mid` gerado — sem banco de dados).

**Fase 3 — voicings automáticos.** `voicing.py` já tem `voice_under_top()` (ponta travada garantida). Os botões de voicing do app (fechado, aberto, drop 2, drop 3, ponta pedal) estão em `web/engine/voicing.js`. Próximos:
inversões, drop 2/3, posição aberta/fechada, faixas por região (baixo C1–B2, ME C2–C4, MD C3–C6, ponta até C7) e
**condução de vozes** — busca de oitavas/inversões minimizando uma função de custo (movimento total em semitons,
penalidade por saltos, bônus por notas comuns, ponta e baixo preservados, distância confortável entre vozes).
Regra: o gerador só atua quando pedido; notas explícitas continuam intocadas.

**Fase 4 — humanização e playback.** O **strum** (grave→agudo ou agudo→grave, 10/20/30 ms) **já existe**, na tela, no
MIDI e na pré‑escuta, e mostra o caminho: opções em `build_midi`, desligadas por padrão para que o MIDI continue exato.
Falta a **humanização** (velocity, atraso e duração aleatórios pequenos, sempre com “Humanization OFF” como padrão) e o
**arpejo**. Ambos entram em `midi_io.py`/`web/engine/midi.js` e na pré‑escuta (`web/audio.js`), com casos novos no teste
de paridade.

**Fase 5 — texto livre e sugestões.** Um parser (`textparse.py`) para entradas como
`1. F#m7b5 LH: F#2 C3 RH: E3 A3 C4 E4 Duration: 4` produzindo o mesmo JSON; depois o modo **harmonic alternatives**
(alvo `Em9`, contexto `B7alt`, ponta `F#` → várias alternativas como `Cmaj7(#11)/E`, estruturas suspensas,
cromáticas, por condução de vozes), cada uma exportável. Tudo entra **antes** do `model.py`; o motor MIDI não muda.

---

## Limitações conhecidas desta versão

- A ponta travada é **validada** (aviso); o app só reorganiza voicings quando você pede, pelos botões (fechado, aberto, drop 2, drop 3, ponta pedal).
- Uma faixa MIDI única (sem separar mãos em faixas).
- A pré‑escuta do navegador é um timbre simples; o objetivo dela é só conferir notas.
- A DAW pode ignorar o BPM do arquivo ao importar (veja "Na DAW").
- Os projetos ficam no aparelho (rascunho automático) ou em arquivos `.json`; não há sincronização entre aparelhos.
- No Android, o Chrome costuma não permitir compartilhar `.mid` direto (sem botão "Enviar"); o arquivo vai para Downloads.
- O fluxo com a IA foi testado com respostas simuladas e conferido no navegador; a qualidade musical depende da IA usada
  (o app garante o formato e a conferência das notas). As pistas sobre cada artista são generalizações a confirmar.
