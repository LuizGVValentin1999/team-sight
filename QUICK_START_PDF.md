# 🚀 Início Rápido - MD para PDF

Três opções para converter seus arquivos Markdown em PDFs profissionais.

## Opção 1: Bash + Pandoc (⭐ Recomendado)

### Passo 1: Instalar dependências
```bash
bash install-dependencies.sh
```

Ou manualmente:
```bash
# Linux (Ubuntu/Debian)
sudo apt-get install pandoc texlive-latex-extra

# macOS
brew install pandoc basictex

# Windows (PowerShell admin)
choco install pandoc
```

### Passo 2: Executar conversão
```bash
chmod +x md-to-pdf.sh
./md-to-pdf.sh
```

**Pronto!** Os PDFs estarão em `./pdfs/`

---

## Opção 2: Python

### Passo 1: Instalar
```bash
pip install markdown2 xhtml2pdf
```

### Passo 2: Executar
```bash
python3 md-to-pdf.py
```

---

## Opção 3: Node.js

### Passo 1: Instalar
```bash
# Primeiro, instale Pandoc (opção 1 acima)
npm install md-pdf puppeteer
```

### Passo 2: Executar
```bash
node md-to-pdf-script.js
```

---

## Usando com npm scripts

Adicione ao `package.json`:

```json
{
  "scripts": {
    "pdf": "bash md-to-pdf.sh documentacao-fluxo/regras-tecnicas pdfs",
    "pdf:docs": "bash md-to-pdf.sh ./documentacao-fluxo ./pdfs-docs"
  }
}
```

Execute:
```bash
npm run pdf
npm run pdf:docs
```

---

## Exemplos de Uso

### Converter pasta específica
```bash
./md-to-pdf.sh ./documentacao-fluxo/regras-tecnicas ./output
```

### Converter todos os .md do projeto
```bash
./md-to-pdf.sh .
```

### Python com diretório customizado
```bash
python3 md-to-pdf.py ./docs ./pdfs-output
```

---

## Troubleshooting

**Erro: "pdflatex not found"**
```bash
# Linux
sudo apt-get install texlive-latex-extra

# macOS
brew install basictex
```

**Erro: "pandoc: command not found"**
```bash
# Verifique instalação
which pandoc
pandoc --version

# Se não encontrar, reinstale
brew install pandoc  # ou apt-get install pandoc
```

**Acentos aparecendo errado**
- Verifique que seu .md é UTF-8:
```bash
file seu-arquivo.md
```

---

## Features dos PDFs Gerados

✅ Índice automático  
✅ Seções numeradas  
✅ Formatação profissional  
✅ Margens e espaçamento otimizados  
✅ Títulos coloridos  
✅ Código destacado  
✅ Tabelas bem formatadas  
✅ Links clicáveis  
✅ Suporte a acentos  

---

## Mais Informações

Para documentação completa:
```bash
cat MD_TO_PDF_README.md
```

---

**Pronto? Comece agora:**
```bash
bash install-dependencies.sh && ./md-to-pdf.sh
```
