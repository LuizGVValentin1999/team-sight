#!/bin/bash

# Script de instalação automática de dependências para conversão MD->PDF

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Instalador - Pandoc + LaTeX        ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}\n"

# Detectar sistema operacional
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo -e "${YELLOW}Sistema detectado: Linux${NC}\n"

    # Detectar distribuição
    if command -v apt-get &> /dev/null; then
        echo -e "${BLUE}Atualizando package manager...${NC}"
        sudo apt-get update

        echo -e "\n${BLUE}Instalando Pandoc...${NC}"
        sudo apt-get install -y pandoc

        echo -e "\n${BLUE}Instalando LaTeX (pode levar alguns minutos)...${NC}"
        sudo apt-get install -y texlive-latex-extra texlive-fonts-recommended texlive-fonts-extra

        echo -e "\n${GREEN}✅ Instalação concluída!${NC}"

    elif command -v dnf &> /dev/null; then
        echo -e "${BLUE}Instalando via DNF (Fedora/RHEL)...${NC}"
        sudo dnf install -y pandoc texlive-latex texlive-latex-fonts
        echo -e "\n${GREEN}✅ Instalação concluída!${NC}"

    elif command -v pacman &> /dev/null; then
        echo -e "${BLUE}Instalando via Pacman (Arch)...${NC}"
        sudo pacman -S --noconfirm pandoc texlive-core texlive-latex texlive-fonts
        echo -e "\n${GREEN}✅ Instalação concluída!${NC}"
    else
        echo -e "${RED}❌ Package manager não identificado${NC}"
        echo "Instale manualmente:"
        echo "  Pandoc: https://pandoc.org/installing.html"
        echo "  LaTeX: https://tug.org/texlive/"
        exit 1
    fi

elif [[ "$OSTYPE" == "darwin"* ]]; then
    echo -e "${YELLOW}Sistema detectado: macOS${NC}\n"

    if ! command -v brew &> /dev/null; then
        echo -e "${RED}❌ Homebrew não está instalado${NC}"
        echo "Instale em: https://brew.sh/"
        exit 1
    fi

    echo -e "${BLUE}Instalando Pandoc...${NC}"
    brew install pandoc

    echo -e "\n${BLUE}Instalando LaTeX (BasicTeX)...${NC}"
    brew install basictex

    # Adicionar ao PATH se necessário
    echo 'export PATH="/usr/local/texlive/2024/bin/x86_64-darwin:$PATH"' >> ~/.zprofile
    source ~/.zprofile

    echo -e "\n${GREEN}✅ Instalação concluída!${NC}"

elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]]; then
    echo -e "${YELLOW}Sistema detectado: Windows${NC}\n"

    if ! command -v choco &> /dev/null; then
        echo -e "${RED}❌ Chocolatey não está instalado${NC}"
        echo "Instale em: https://chocolatey.org/install"
        exit 1
    fi

    echo -e "${BLUE}Instalando Pandoc...${NC}"
    choco install -y pandoc

    echo -e "\n${BLUE}Instalando MiKTeX (LaTeX para Windows)...${NC}"
    choco install -y miktex

    echo -e "\n${GREEN}✅ Instalação concluída!${NC}"
    echo -e "${YELLOW}Nota: Pode ser necessário reiniciar o PowerShell${NC}"

else
    echo -e "${RED}❌ Sistema operacional não reconhecido${NC}"
    echo "Instale manualmente:"
    echo "  Pandoc: https://pandoc.org/installing.html"
    echo "  LaTeX: https://tug.org/texlive/"
    exit 1
fi

# Verificar instalação
echo -e "\n${BLUE}Verificando instalação...${NC}\n"

if command -v pandoc &> /dev/null; then
    echo -e "${GREEN}✅ Pandoc instalado:${NC}"
    pandoc --version | head -1
else
    echo -e "${RED}❌ Pandoc não encontrado${NC}"
    exit 1
fi

if command -v pdflatex &> /dev/null; then
    echo -e "${GREEN}✅ pdflatex instalado${NC}"
else
    echo -e "${YELLOW}⚠️  pdflatex não encontrado (talvez precise de configuração adicional)${NC}"
fi

echo -e "\n${GREEN}═══════════════════════════════════════${NC}"
echo -e "${GREEN}🎉 Tudo pronto! Agora você pode usar:${NC}"
echo -e "${GREEN}═══════════════════════════════════════${NC}"
echo -e "\n${BLUE}bash md-to-pdf.sh${NC}\n"
