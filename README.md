# Harmony Lab

Laboratório local de **voicings, reharmonização e condução de vozes** que transforma exatamente as notas que você
discutiu — mão esquerda, mão direita, oitavas, soprano — num arquivo **`.mid`** para arrastar em qualquer DAW
(Studio One, Ableton, Logic, Reaper…) e tocar com qualquer VST (Pianoteq, Kontakt, Rhodes, strings, synth).

> Foco desta primeira versão (MVP): **os voicings exatos que surgem nas conversas de harmonia viram MIDI, sem
> surpresas** — notas, oitavas, durações, BPM e ordem iguais ao que foi digitado.

---

## Início rápido

Precisa de **Python 3.10+**. A única dependência é o [`mido`](https://mido.readthedocs.io).

**Windows** — dê dois cliques em `iniciar-windows.bat`.
**macOS / Linux** — rode `./iniciar-mac-linux.sh`.

Na primeira vez o script cria um ambiente isolado (`.venv`) e instala o `mido`; depois só abre o app.
Se preferir fazer à mão:

```bash
cd harmony-lab
python -m venv .venv
# Windows: .venv\Scripts\activate      macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python -m harmonylab            # abre http://127.0.0.1:8765 no navegador
```

Para encerrar: `Ctrl+C` no terminal.

### Usar pelo celular (mesma rede Wi‑Fi)

```bash
python -m harmonylab serve --host 0.0.0.0
```

O terminal mostra o endereço (ex.: `http://192.168.0.12:8765`). Por padrão o servidor só aceita conexões da
própria máquina.

---

## Como usar

1. Ajuste **BPM**, **compasso**, **velocity padrão** e a convenção do **dó central**.
2. Em cada acorde, digite as notas da **mão direita** e da **mão esquerda** com oitava: `D4 Eb4 G4 C5`.
   O teclado e as fichas logo abaixo mostram, em tempo real, exatamente o que vai para o MIDI
   (do grave ao agudo, com o número MIDI de cada nota e o **soprano** destacado).
3. Escolha a duração (`½`, `1` ou `2` compassos, ou qualquer número de tempos).
4. **▶ Ouvir** faz uma pré‑escuta simples no navegador (só para conferir; o som de verdade é o do seu VST).
5. **Gerar MIDI** salva o `.mid`. Arraste o arquivo para uma faixa de instrumento na DAW.

Outras coisas na tela:

| Recurso | O que faz |
|---|---|
| **Soprano travado** | Declara a nota que *precisa* ser a mais aguda. Se outra nota ficar acima (ou ela faltar), aparece um aviso. O botão **Travar** fixa o soprano atual. |
| **Mais: baixo/pedal, notas sem mão** | Notas extras que soam junto (ex.: pedal de `E1` sob o acorde, ou notas sem mão definida). |
| **Notas omitidas / comentário** | Só anotação (não vão para o MIDI). |
| **+ Pausa** | Compasso de silêncio (útil para comparar ideias). |
| **Duplicar / mover / remover** | Remover e trocar de projeto têm **Desfazer**. |
| **Menu ⋯** | Abrir/salvar projeto `.json`, **colar JSON** (ex.: resposta do ChatGPT), exemplo, projeto novo. |

O trabalho fica salvo automaticamente no navegador (rascunho); para guardar de verdade, use **Salvar projeto**.

### Erros e avisos

- **Erro** (vermelho) impede gerar o MIDI: nota que não existe (`H3`), nota sem oitava (`Eb`), fora de 0–127,
  BPM/duração/velocity inválidos.
- **Aviso** (amarelo) e **nota** (cinza) nunca bloqueiam: soprano travado que não é o mais agudo, mesma tecla
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
- Para conferir um `.mid` sem abrir a DAW: `python -m harmonylab inspect arquivo.mid` (use `--middle-c C3` para ver
  os nomes como no Ableton/Studio One).

---

## Formato do projeto (JSON)

A interface, a linha de comando e o gerador MIDI usam este mesmo modelo:

```json
{
  "title": "Resolução B7alt para Em com F# no soprano",
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
| `chords[].left_hand`, `right_hand` | não | Lista (`["B2","A3"]`) **ou** texto (`"B2 A3"`). Nomes com oitava ou números MIDI. |
| `chords[].bass`, `notes` | não | Baixo/pedal e notas sem mão definida. Também soam. |
| `chords[].duration_beats` | não (1 compasso) | Em tempos de semínima (4 = 1 compasso em 4/4; 3 = 1 compasso em 6/8). Ou use `duration_bars`. |
| `chords[].top_note` | não | Soprano travado (validação: deve ser a nota mais aguda). |
| `chords[].velocity` | não | 1–127. |
| `chords[].symbol`, `omitted`, `comment` | não | Informativos. |

Acorde sem nenhuma nota = pausa. Um exemplo completo está em
[`examples/resolucao_em_fsharp_soprano.json`](examples/resolucao_em_fsharp_soprano.json) (e o `.mid` gerado ao lado,
pronto para arrastar na DAW).

### Usando com o ChatGPT

Peça a resposta já no formato do Harmony Lab, por exemplo:

> Responda só com um bloco JSON no formato Harmony Lab: `tempo`, `time_signature`, `middle_c: "C4"` e uma lista
> `chords`, cada um com `symbol`, `duration_beats`, `left_hand`, `right_hand` (notas com oitava, MIDI 60 = C4),
> `top_note` e `comment`.

Depois use **⋯ → Colar JSON**: o app aceita o JSON puro ou dentro de um bloco ```` ```json ```` com texto em volta.

---

## Linha de comando

```bash
python -m harmonylab                              # interface web (igual a "serve")
python -m harmonylab serve --port 9000 --no-browser
python -m harmonylab export projeto.json          # gera projeto.mid (ou -o outro.mid)
python -m harmonylab check projeto.json           # mostra notas grave→agudo, MIDI, soprano, baixo e avisos
python -m harmonylab inspect arquivo.mid          # lista as notas de qualquer .mid
```

---

## Arquitetura

```
 linguagem natural / ChatGPT   (futuro: parser de texto livre — Fase 5)
              │
              ▼
   JSON do projeto  ◄────────────  interface web (web/)   ·   linha de comando (cli.py)
              │                         ▲
              ▼                         │ análise (notas, soprano, avisos)
   model.py  Project → ChordEvent ──► analysis.py
              │  (notas como objetos Note)
              ▼
   pitch.py  Note = número MIDI + grafia original        voicing.py  geradores automáticos (Fase 3)
              │
              ▼
   midi_io.py  Project → .mid (mido)  ·  .mid → notas (conferência)
```

Cada camada só conhece as de baixo. O gerador MIDI **não sabe nada** de interface, de texto livre nem de nomes de
acordes: recebe um `Project` com notas concretas. Por isso dá para trocar a interface ou acrescentar um parser de
linguagem natural sem tocar no motor MIDI.

### Decisões e por quê

| Decisão | Motivo |
|---|---|
| **`mido`** para MIDI | Maduro, puro Python, controle direto de ticks e mensagens. O `pretty_midi` trabalha em segundos (ponto flutuante) e puxa `numpy`; aqui a fonte da verdade é o tempo musical. |
| **Servidor da biblioteca padrão** (`http.server`) | Um usuário, na própria máquina: não precisa de Flask/FastAPI, banco de dados nem login. |
| **Interface em HTML/CSS/JS puros** (sem build, sem npm) | Abre direto do Python, funciona offline, celular primeiro, tema claro/escuro automático. |
| **Toda a lógica musical no Python** | A interface só edita o JSON e mostra o que o servidor analisou — uma única fonte da verdade, testada. |
| **MIDI tipo 0, 480 ticks/♩, posições em ticks inteiros** | Importa igual em qualquer DAW; somar ticks inteiros evita deriva (4 tempos = 1920 ticks em qualquer BPM). |
| **Número MIDI canônico + grafia guardada à parte** | `C#4`/`Db4` soam igual mas aparecem como você escreveu. |

### Estrutura de diretórios

```
harmony-lab/
├── harmonylab/
│   ├── pitch.py        notas ↔ MIDI, convenções de oitava, grafia enarmônica
│   ├── model.py        Project / ChordEvent, leitura tolerante do JSON com lista de erros
│   ├── analysis.py     soprano, baixo, espaçamento, dobras, avisos musicais
│   ├── midi_io.py      gera .mid e lê de volta (conferência/testes)
│   ├── voicing.py      geradores automáticos — hoje: voicing fechado sob soprano travado
│   ├── server.py       servidor local + API JSON
│   ├── cli.py          linha de comando
│   └── web/            index.html, styles.css, app.js, keyboard.js, audio.js, icon.svg
├── examples/           projeto de exemplo (.json) e o .mid gerado
├── tests/              testes automatizados (pytest)
├── iniciar-windows.bat / iniciar-mac-linux.sh
├── requirements.txt    mido
└── requirements-dev.txt  + pytest
```

### API local

| Rota | Uso |
|---|---|
| `POST /api/validate` | Projeto → análise por acorde (notas, MIDI, soprano, baixo, erros/avisos, totais). |
| `POST /api/export` | Projeto → `audio/midi` (ou 400 com os erros). |
| `POST /api/convention` | `{project, to: "C3"}` → mesmo projeto com nomes reescritos (alturas iguais). |
| `GET /api/example` | Projeto de exemplo. |

---

## Testes

```bash
pip install -r requirements-dev.txt
python -m pytest
```

Cobrem, entre outros: `C4 = 60`, `C#4 = Db4 = 61`, `B3 = 59`, `B#3`/`Cb4`, convenção C3; preservação da grafia;
leitura tolerante do JSON (todos os erros de uma vez); **top note**: com soprano `F#5`, nenhum voicing gerado
automaticamente passa de `F#5` (testado em todas as combinações de até 6 classes de altura); **duração**: 4 tempos em
4/4 = exatamente 1 compasso em vários BPMs, e outras fórmulas (3/4, 6/8, 5/4, 7/8); **MIDI relido do disco**:
pitches, note on/off, velocity, duração, ordem temporal, tempo, compasso, marcadores, nota comum re‑articulada,
pausas; API HTTP e linha de comando.

---

## Próximas fases (onde cada coisa se encaixa)

**Fase 2 — projetos e comparação.** Abrir/salvar `.json` já existe. Falta: **comparação A/B** (função em `midi_io` ou
um módulo `arrange.py` que monta `contexto → alternativa → pausa`, repetindo N vezes, a partir de vários
`ChordEvent`), exportar várias alternativas de uma vez, e um banco de experimentos (pasta de `.json` com `name`,
`tags`, comentários e o `.mid` gerado — sem banco de dados).

**Fase 3 — voicings automáticos.** `voicing.py` já tem `voice_under_top()` (soprano travado garantido). Próximos:
inversões, drop 2/3, posição aberta/fechada, faixas por região (baixo C1–B2, ME C2–C4, MD C3–C6, soprano até C7) e
**condução de vozes** — busca de oitavas/inversões minimizando uma função de custo (movimento total em semitons,
penalidade por saltos, bônus por notas comuns, soprano e baixo preservados, distância confortável entre vozes).
Regra: o gerador só atua quando pedido; notas explícitas continuam intocadas.

**Fase 4 — humanização e playback.** Opções em `build_midi` (desligadas por padrão, para que o MIDI continue
exato): velocity/atraso/duração aleatórios pequenos, **strum** grave→agudo ou agudo→grave (10/20/30 ms) e arpejo. A
pré‑escuta do navegador (`web/audio.js`) já existe e pode ganhar os mesmos parâmetros.

**Fase 5 — texto livre e sugestões.** Um parser (`textparse.py`) para entradas como
`1. F#m7b5 LH: F#2 C3 RH: E3 A3 C4 E4 Duration: 4` produzindo o mesmo JSON; depois o modo **harmonic alternatives**
(alvo `Em9`, contexto `B7alt`, soprano `F#` → várias alternativas como `Cmaj7(#11)/E`, estruturas suspensas,
cromáticas, por condução de vozes), cada uma exportável. Tudo entra **antes** do `model.py`; o motor MIDI não muda.

---

## Limitações conhecidas desta versão

- O soprano travado é **validado** (aviso), não reorganizado automaticamente — reorganizar é a Fase 3.
- Uma faixa MIDI única (sem separar mãos em faixas).
- A pré‑escuta do navegador é um timbre simples; o objetivo dela é só conferir notas.
- A DAW pode ignorar o BPM do arquivo ao importar (veja "Na DAW").
