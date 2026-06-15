# Conversão de Markdown para PDF

Scripts para converter seus arquivos Markdown em PDFs formatados e profissionais.

## 📋 Opções Disponíveis

### Opção 1: Script Bash (Recomendado) ✅

Usa `pandoc` para melhor controle de formatação.

#### Instalação

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install pandoc texlive-latex-extra texlive-fonts-recommended
```

**macOS:**
```bash
brew install pandoc basictex
```

**Windows (PowerShell Admin):**
```powershell
choco install pandoc
# Ou instale manualmente: https://pandoc.org/installing.html
```

#### Uso

```bash
# Tornar o script executável
chmod +x md-to-pdf.sh

# Executar (converte documentacao-fluxo/regras-tecnicas para ./pdfs)
./md-to-pdf.sh

# Ou especificar pastas customizadas
./md-to-pdf.sh ./documentacao-fluxo/regras-tecnicas ./pdfs-saida

# Converter um único arquivo
./md-to-pdf.sh ./seu-arquivo.md
```

### Opção 2: Script Node.js

Alternativa usando Node.js (requer pandoc instalado também).

#### Instalação

```bash
npm install md-pdf puppeteer
# ou
yarn add md-pdf puppeteer
```

#### Uso

```bash
# Executar
node md-to-pdf-script.js

# Com pastas customizadas
node md-to-pdf-script.js ./entrada ./saida
```

### Opção 3: Usar make ou npm scripts

Adicione ao seu `package.json`:

```json
{
  "scripts": {
    "pdf": "bash md-to-pdf.sh documentacao-fluxo/regras-tecnicas pdfs",
    "pdf:all": "bash md-to-pdf.sh . pdfs-all"
  }
}
```

Depois execute:
```bash
npm run pdf
npm run pdf:all
```

## 📄 Características da Formatação

Os PDFs gerados incluem:

- ✅ Margens profissionais (2.5cm)
- ✅ Índice automático (Table of Contents)
- ✅ Numeração de seções
- ✅ Espaçamento entre linhas otimizado (1.5)
- ✅ Títulos coloridos e hierárquicos
- ✅ Código destacado com background
- ✅ Tabelas bem formatadas
- ✅ Links coloridos
- ✅ Quebras de página inteligentes
- ✅ Header e footer nas páginas
- ✅ Suporte a caracteres acentuados (UTF-8)

## 🎨 Customização

### Modificar cores

Abra o arquivo `md-to-pdf.sh` e procure por `\color{blue}`. Mude para:
- `red`, `green`, `yellow`, `orange`, `purple`, etc.

### Modificar tamanho de fonte

Na seção de template, altere:
```tex
\documentclass[$if(fontsize)$$fontsize$,$endif$...]{article}
```

Passe `--variable fontsize=12pt` ao pandoc.

### Adicionar logo ou rodapé personalizado

Edite a seção `\pagestyle{fancy}` no template LaTeX.

## 🔧 Troubleshooting

### Erro: "pdflatex not found"

```bash
# Ubuntu/Debian
sudo apt-get install texlive-latex-extra

# macOS - complete TeX installation
brew install texlive
```

### Erro: "pandoc: command not found"

Verifique se pandoc está instalado:
```bash
pandoc --version
```

Se não aparecer versão, reinstale.

### Acentos ou caracteres estranhos no PDF

Certifique-se que seu arquivo .md está em UTF-8:
```bash
file seu-arquivo.md
# Deve mostrar "UTF-8 Unicode text"
```

Se não estiver:
```bash
iconv -f ISO-8859-1 -t UTF-8 seu-arquivo.md -o seu-arquivo-utf8.md
```

## 📊 Exemplo de Saída

```
Convertendo: documentacao-fluxo/regras-tecnicas/01-projecao-fluxo-de-caixa.md
✅ Criado: pdfs/01-projecao-fluxo-de-caixa.pdf
✅ Criado: pdfs/02-saldos.pdf
✅ Criado: pdfs/03-documentos.pdf
...
Total de arquivos: 18
Convertidos com sucesso: 18
PDFs gerados em: pdfs/
```

## 📚 Arquivos de Documentação

O script encontrará e converterá todos os `.md` desta pasta:
```
documentacao-fluxo/regras-tecnicas/
├── 01-projecao-fluxo-de-caixa.md
├── 02-saldos.md
├── 03-documentos.md
├── 04-integracao-de-pessoas.md
├── 05-fotografia-de-posicoes.md
├── 06-projetar-contratos.md
├── 07-projetar-conciliacao-bancaria.md
├── 08-projetar-calendario-de-previsoes.md
├── 09-projetar-lancamento-manual-de-previsao.md
├── 10-scripts-uteis.md
├── 11-open-finance.md
├── 12-montagem-tabela-fluxo-de-caixa.md
├── 13-cepp-motor-de-processos.md
├── 14-conversao-de-moeda.md
└── ... (mais arquivos)
```

## 🚀 Quick Start

```bash
# 1. Instalar dependências (uma única vez)
sudo apt-get install pandoc texlive-latex-extra

# 2. Tornar script executável
chmod +x md-to-pdf.sh

# 3. Executar conversão
./md-to-pdf.sh

# 4. Ver PDFs gerados
ls -lh pdfs/
```

## 💡 Dicas

- Use `--toc` para gerar índice automático
- Use `--number-sections` para numerar seções
- Use `-v geometry:margin=Xcm` para ajustar margens
- Use `-v linestretch=X` para espaçamento entre linhas

## 📖 Referência

- [Pandoc Documentation](https://pandoc.org/)
- [LaTeX Book](https://en.wikibooks.org/wiki/LaTeX)
- [Markdown Syntax](https://daringfireball.net/projects/markdown/syntax)

---

**Suporte:** Em caso de dúvidas, verifique a instalação do pandoc:
```bash
pandoc --version
pdflatex --version
```
