#!/bin/bash

# Script para converter arquivos Markdown para PDF formatados
# Uso: ./md-to-pdf.sh [pasta-entrada] [pasta-saida]

# Configurações padrão
INPUT_DIR="${1:-.}"
OUTPUT_DIR="${2:-./pdfs}"

# Cores para output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Criar diretório de saída se não existir
mkdir -p "$OUTPUT_DIR"

# Verificar se pandoc está instalado
if ! command -v pandoc &> /dev/null; then
    echo -e "${RED}❌ Pandoc não está instalado!${NC}"
    echo "Para instalar:"
    echo "  Ubuntu/Debian: sudo apt-get install pandoc texlive-latex-extra"
    echo "  macOS: brew install pandoc basictex"
    echo "  Windows: choco install pandoc"
    exit 1
fi

# Criar arquivo de template LaTeX para melhor formatação
create_template() {
    cat > /tmp/pandoc-template.tex << 'EOF'
\documentclass[$if(fontsize)$$fontsize$,$endif$$if(lang)$Portuguese$endif$,a4paper]{article}

\usepackage[utf-8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage[portuguese]{babel}
\usepackage{geometry}
\usepackage{fancyhdr}
\usepackage{graphicx}
\usepackage{xcolor}
\usepackage{hyperref}
\usepackage{float}
\usepackage{booktabs}
\usepackage{listings}

% Configuração de margens
\geometry{
  a4paper,
  left=2.5cm,
  right=2.5cm,
  top=3cm,
  bottom=3cm,
  headheight=15pt
}

% Configuração de cor para links
\hypersetup{
  colorlinks=true,
  linkcolor=blue,
  urlcolor=blue,
  citecolor=blue
}

% Espaçamento entre linhas
\setlength{\parskip}{1em}
\setlength{\parindent}{0pt}

% Configuração de código
\lstset{
  breaklines=true,
  basicstyle=\ttfamily\small,
  backgroundcolor=\color{gray!10},
  frame=single,
  rulecolor=\color{gray!20},
  breakatwhitespace=true,
  showspaces=false,
  showtabs=false,
  tabsize=2
}

% Header e Footer
\pagestyle{fancy}
\lhead{\textit{Documentação - Fluxo de Caixa}}
\rhead{}
\cfoot{\thepage}
\renewcommand{\headrulewidth}{0.5pt}
\renewcommand{\footrulewidth}{0.5pt}

% Customizar títulos
\usepackage{titlesec}
\titleformat{\section}{\Large\bfseries\color{blue}}{}{0pt}{}[\titlerule]
\titleformat{\subsection}{\large\bfseries\color{darkgray}}{}{0pt}{}
\titleformat{\subsubsection}{\bfseries}{}{0pt}{}

% Página de título
\title{$title$}
\author{$author$}
\date{\today}

\begin{document}

$body$

\end{document}
EOF
}

# Função para converter um arquivo
convert_file() {
    local input_file="$1"
    local filename=$(basename "$input_file" .md)
    local output_file="$OUTPUT_DIR/${filename}.pdf"

    echo -e "${BLUE}Convertendo: $input_file${NC}"

    # Opções do pandoc para melhor formatação
    pandoc "$input_file" \
        --template=/tmp/pandoc-template.tex \
        --pdf-engine=pdflatex \
        --toc \
        --toc-depth=3 \
        --number-sections \
        --variable urlcolor=blue \
        --variable linkcolor=blue \
        --variable geometry:margin=2.5cm \
        --variable linestretch=1.5 \
        --from=markdown+yaml_metadata_block \
        --standalone \
        -o "$output_file" 2>/dev/null

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Criado: $output_file${NC}"
    else
        echo -e "${RED}❌ Erro ao converter: $input_file${NC}"
        return 1
    fi
}

# Processar arquivos
echo -e "${BLUE}=====================================${NC}"
echo -e "${BLUE}Converter Markdown para PDF${NC}"
echo -e "${BLUE}=====================================${NC}"
echo "Entrada: $INPUT_DIR"
echo "Saída: $OUTPUT_DIR"
echo ""

# Criar template
create_template

# Encontrar e converter todos os .md
file_count=0
success_count=0

while IFS= read -r -d '' file; do
    convert_file "$file"
    ((file_count++))
    if [ $? -eq 0 ]; then
        ((success_count++))
    fi
done < <(find "$INPUT_DIR" -name "*.md" -type f -print0)

echo ""
echo -e "${BLUE}=====================================${NC}"
echo -e "Total de arquivos: $file_count"
echo -e "Convertidos com sucesso: ${GREEN}$success_count${NC}"
echo -e "${BLUE}=====================================${NC}"

# Listar PDFs criados
if [ $success_count -gt 0 ]; then
    echo -e "\n${GREEN}PDFs gerados em: $OUTPUT_DIR/${NC}"
    ls -lh "$OUTPUT_DIR"/*.pdf 2>/dev/null | awk '{print "  " $9 " (" $5 ")"}'
fi
