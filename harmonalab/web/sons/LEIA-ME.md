# Bancos de sons do Harmona Lab

Cada arquivo é baixado só quando alguém escolhe aquele som, e fica guardado no aparelho. A lista (nome, tipo, tamanho,
crédito e licença de cada um) está em `harmonalab/web/kb/sons.js`.

## Instrumentos do MuseScore General (`ms-*.sf3`)

Um arquivo SF3 por instrumento, separados do `MuseScore_General.sf3` (versão 0.2.0) por `design/split_soundfont.mjs`.
Licença **MIT**: o texto completo, com os créditos, está em `MuseScore_General_License.md` (ele tem de acompanhar os
arquivos). Origem: https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General/

`ms-sanfona-italiana.sf3` é o "Italian Accordion" do original (banco 8, programa 21), gravado no banco 0 como os outros.

## Outros

- `SF-3007-Drum-Kit-Public.sf2`: bateria Sonor Force 3007, domínio público.
- `FreeRhodes_ff_layer.SF2`, `yahama U1.SF2`: licença a confirmar.

## Para acrescentar um som

- Até 25 MB por arquivo (limite do Cloudflare Pages).
- O repositório é público: só suba bancos cuja licença permita redistribuir, e anote de onde cada um veio.
- Acrescente a linha em `kb/sons.js` (o teste confere o tamanho, o crédito e a licença).
