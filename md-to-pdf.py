#!/usr/bin/env python3
"""
Conversor de Markdown para PDF usando ReportLab
Instalação: pip install reportlab markdown2
"""

import os
import sys
import subprocess
from pathlib import Path
from datetime import datetime

# Cores para output
class Colors:
    GREEN = '\033[92m'
    BLUE = '\033[94m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    END = '\033[0m'

def log_success(msg):
    print(f"{Colors.GREEN}✅ {msg}{Colors.END}")

def log_info(msg):
    print(f"{Colors.BLUE}ℹ️  {msg}{Colors.END}")

def log_error(msg):
    print(f"{Colors.RED}❌ {msg}{Colors.END}")

def log_title(msg):
    print(f"\n{Colors.BLUE}{'='*40}{Colors.END}")
    print(f"{Colors.BLUE}{msg}{Colors.END}")
    print(f"{Colors.BLUE}{'='*40}{Colors.END}\n")

def check_dependencies():
    """Verificar se pandoc está instalado"""
    try:
        subprocess.run(['pandoc', '--version'], capture_output=True, check=True)
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False

def convert_with_pandoc(input_file, output_file):
    """Converter usando Pandoc (melhor qualidade)"""
    try:
        cmd = [
            'pandoc',
            input_file,
            '-o', output_file,
            '--pdf-engine=pdflatex',
            '--toc',
            '--toc-depth=3',
            '--number-sections',
            '--variable', 'urlcolor=blue',
            '--variable', 'linkcolor=blue',
            '--variable', 'geometry:margin=2.5cm',
            '--variable', 'linestretch=1.5',
            '--from=markdown+yaml_metadata_block',
            '--standalone'
        ]
        subprocess.run(cmd, capture_output=True, check=True)
        return True
    except Exception as e:
        log_error(f"Erro com pandoc: {e}")
        return False

def convert_with_html2pdf(input_file, output_file):
    """Converter usando html2pdf como fallback"""
    try:
        import markdown2
        from xhtml2pdf import pisa

        # Ler markdown
        with open(input_file, 'r', encoding='utf-8') as f:
            md_content = f.read()

        # Converter para HTML
        html_content = markdown2.markdown(
            md_content,
            extras=['tables', 'fenced-code-blocks', 'code-friendly', 'toc']
        )

        # Template HTML
        html_template = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                * {{
                    margin: 0;
                    padding: 0;
                }}
                body {{
                    font-family: 'Arial', sans-serif;
                    line-height: 1.6;
                    color: #333;
                    font-size: 12pt;
                    padding: 2.5cm;
                }}
                h1 {{
                    color: #0066cc;
                    font-size: 28pt;
                    margin: 2cm 0 1cm 0;
                    border-bottom: 3px solid #0066cc;
                    padding-bottom: 0.5cm;
                    page-break-after: avoid;
                }}
                h2 {{
                    color: #004999;
                    font-size: 20pt;
                    margin: 1.5cm 0 0.8cm 0;
                    page-break-after: avoid;
                }}
                h3 {{
                    color: #666;
                    font-size: 14pt;
                    margin: 1cm 0 0.5cm 0;
                    page-break-after: avoid;
                }}
                p {{
                    margin: 0.8cm 0;
                    text-align: justify;
                }}
                code {{
                    background-color: #f5f5f5;
                    padding: 2px 6px;
                    border-radius: 3px;
                    font-family: 'Courier New', monospace;
                    font-size: 10pt;
                }}
                pre {{
                    background-color: #f8f8f8;
                    padding: 1cm;
                    border-left: 4px solid #0066cc;
                    border-radius: 4px;
                    overflow-x: auto;
                    margin: 1cm 0;
                    page-break-inside: avoid;
                }}
                table {{
                    border-collapse: collapse;
                    width: 100%;
                    margin: 1cm 0;
                }}
                table th,
                table td {{
                    border: 1px solid #ddd;
                    padding: 0.5cm;
                    text-align: left;
                }}
                table th {{
                    background-color: #e6f0ff;
                    font-weight: bold;
                    color: #0066cc;
                }}
                table tr:nth-child(even) {{
                    background-color: #f9f9f9;
                }}
                ul, ol {{
                    margin: 0.8cm 0;
                    padding-left: 2cm;
                }}
                li {{
                    margin: 0.4cm 0;
                }}
                blockquote {{
                    border-left: 4px solid #0066cc;
                    padding-left: 1cm;
                    margin: 0;
                    color: #666;
                    font-style: italic;
                }}
                a {{
                    color: #0066cc;
                    text-decoration: none;
                }}
                a:hover {{
                    text-decoration: underline;
                }}
                img {{
                    max-width: 100%;
                    height: auto;
                    margin: 1cm 0;
                }}
                hr {{
                    border: none;
                    border-top: 2px solid #ddd;
                    margin: 2cm 0;
                    page-break-after: avoid;
                }}
            </style>
        </head>
        <body>
            <div class="content">
                {html_content}
            </div>
            <p style="margin-top: 3cm; padding-top: 1cm; border-top: 1px solid #ddd; font-size: 10pt; color: #999;">
                Gerado em {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}
            </p>
        </body>
        </html>
        """

        # Gerar PDF
        with open(output_file, 'wb') as pdf_file:
            pisa.CreatePDF(
                html_template,
                pdf_file,
                verbose=0
            )
        return True

    except ImportError as e:
        log_error(f"Dependências Python faltando: {e}")
        log_info("Instale com: pip install markdown2 xhtml2pdf")
        return False
    except Exception as e:
        log_error(f"Erro na conversão: {e}")
        return False

def convert_file(input_file, output_dir):
    """Converter um arquivo markdown para PDF"""
    filename = Path(input_file).stem
    output_file = os.path.join(output_dir, f"{filename}.pdf")

    log_info(f"Convertendo: {input_file}")

    # Tentar com pandoc primeiro
    if check_dependencies():
        success = convert_with_pandoc(input_file, output_file)
    else:
        log_info("Pandoc não disponível, tentando alternativa...")
        success = convert_with_html2pdf(input_file, output_file)

    if success and os.path.exists(output_file):
        size_kb = os.path.getsize(output_file) / 1024
        log_success(f"Criado: {output_file} ({size_kb:.1f} KB)")
        return True
    else:
        log_error(f"Falha ao converter: {input_file}")
        return False

def main():
    """Função principal"""
    input_dir = sys.argv[1] if len(sys.argv) > 1 else '.'
    output_dir = sys.argv[2] if len(sys.argv) > 2 else 'pdfs'

    log_title('Converter Markdown para PDF')

    print(f"Entrada: {input_dir}")
    print(f"Saída: {output_dir}\n")

    # Criar diretório de saída
    os.makedirs(output_dir, exist_ok=True)

    # Encontrar arquivos markdown
    files = []
    for root, dirs, filenames in os.walk(input_dir):
        for filename in filenames:
            if filename.endswith('.md'):
                files.append(os.path.join(root, filename))

    if not files:
        log_error(f"Nenhum arquivo .md encontrado em {input_dir}")
        sys.exit(1)

    print(f"Encontrados {len(files)} arquivo(s) markdown\n")

    # Converter todos
    success_count = 0
    for input_file in files:
        if convert_file(input_file, output_dir):
            success_count += 1

    # Resumo
    log_title('Conversão Concluída')
    print(f"Total: {len(files)}")
    print(f"{Colors.GREEN}Sucesso: {success_count}{Colors.END}")

    # Listar PDFs
    if success_count > 0:
        pdf_files = [f for f in os.listdir(output_dir) if f.endswith('.pdf')]
        print(f"\n{Colors.GREEN}PDFs gerados em: {output_dir}{Colors.END}")
        for pdf_file in sorted(pdf_files):
            size = os.path.getsize(os.path.join(output_dir, pdf_file)) / 1024
            print(f"  📄 {pdf_file} ({size:.1f} KB)")

if __name__ == '__main__':
    main()
