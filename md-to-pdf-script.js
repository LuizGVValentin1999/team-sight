#!/usr/bin/env node

/**
 * Script para converter Markdown para PDF
 * Uso: node md-to-pdf-script.js [pasta-entrada] [pasta-saida]
 *
 * Dependências: npm install md-pdf puppeteer
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

const inputDir = process.argv[2] || './documentacao-fluxo/regras-tecnicas';
const outputDir = process.argv[3] || './pdfs';

const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    blue: '\x1b[34m',
    red: '\x1b[31m'
};

const log = {
    success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
    info: (msg) => console.log(`${colors.blue}ℹ️  ${msg}${colors.reset}`),
    error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
    title: (msg) => console.log(`\n${colors.blue}=====================================${colors.reset}\n${colors.blue}${msg}${colors.reset}\n${colors.blue}=====================================${colors.reset}\n`)
};

async function createCSSTemplate() {
    const css = `
    <style>
        @page {
            size: A4;
            margin: 2.5cm;
            padding: 0;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            font-size: 11pt;
        }

        h1 {
            color: #0066cc;
            font-size: 28pt;
            margin-top: 2cm;
            margin-bottom: 1cm;
            border-bottom: 3px solid #0066cc;
            padding-bottom: 0.5cm;
            page-break-after: avoid;
        }

        h2 {
            color: #004999;
            font-size: 20pt;
            margin-top: 1.5cm;
            margin-bottom: 0.8cm;
            page-break-after: avoid;
        }

        h3 {
            color: #666;
            font-size: 14pt;
            margin-top: 1cm;
            margin-bottom: 0.5cm;
            page-break-after: avoid;
        }

        p {
            margin: 0.8cm 0;
            text-align: justify;
        }

        code {
            background-color: #f5f5f5;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'Courier New', monospace;
            font-size: 10pt;
        }

        pre {
            background-color: #f8f8f8;
            padding: 1cm;
            border-left: 4px solid #0066cc;
            border-radius: 4px;
            overflow-x: auto;
            margin: 1cm 0;
        }

        pre code {
            background: none;
            padding: 0;
        }

        table {
            border-collapse: collapse;
            width: 100%;
            margin: 1cm 0;
            page-break-inside: avoid;
        }

        table th,
        table td {
            border: 1px solid #ddd;
            padding: 0.5cm;
            text-align: left;
        }

        table th {
            background-color: #e6f0ff;
            font-weight: bold;
            color: #0066cc;
        }

        table tr:nth-child(even) {
            background-color: #f9f9f9;
        }

        ul, ol {
            margin: 0.8cm 0;
            padding-left: 2cm;
        }

        li {
            margin: 0.4cm 0;
        }

        blockquote {
            border-left: 4px solid #0066cc;
            padding-left: 1cm;
            margin-left: 0;
            color: #666;
            font-style: italic;
        }

        a {
            color: #0066cc;
            text-decoration: none;
        }

        a:hover {
            text-decoration: underline;
        }

        img {
            max-width: 100%;
            height: auto;
            margin: 1cm 0;
        }

        hr {
            border: none;
            border-top: 2px solid #ddd;
            margin: 2cm 0;
            page-break-after: avoid;
        }

        @media print {
            h1, h2, h3 {
                page-break-after: avoid;
            }
            pre, table {
                page-break-inside: avoid;
            }
        }
    </style>
    `;
    return css;
}

async function convertMarkdownToHtml(markdownContent) {
    // Simples conversão markdown para HTML (alternativa ao pandoc)
    let html = markdownContent;

    // Escape HTML
    html = html.replace(/&/g, '&amp;')
               .replace(/</g, '&lt;')
               .replace(/>/g, '&gt;');

    // Títulos
    html = html.replace(/^### (.*?)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.*?)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.*?)$/gm, '<h1>$1</h1>');

    // Bold e Italic
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

    // Links
    html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>');

    // Code blocks
    html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Lists
    html = html.replace(/^- (.*?)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');

    // Paragraphs
    html = html.replace(/\n\n/g, '</p><p>');
    html = '<p>' + html + '</p>';

    return html;
}

async function convertFile(inputFile) {
    const filename = path.basename(inputFile, '.md');
    const outputFile = path.join(outputDir, `${filename}.pdf`);

    log.info(`Convertendo: ${inputFile}`);

    try {
        // Verificar se pandoc está disponível
        await execAsync('which pandoc', { stdio: 'pipe' });

        // Usar pandoc se disponível
        const command = `pandoc "${inputFile}" -o "${outputFile}" \
            --pdf-engine=pdflatex \
            --toc \
            --toc-depth=3 \
            --number-sections \
            --variable urlcolor=blue \
            --variable linkcolor=blue \
            --variable geometry:margin=2.5cm \
            --variable linestretch=1.5 \
            --from=markdown+yaml_metadata_block \
            --standalone`;

        await execAsync(command);
        log.success(`Criado: ${outputFile}`);
        return true;
    } catch (error) {
        if (error.message.includes('pandoc')) {
            log.error(`Pandoc não encontrado. Instale com: sudo apt-get install pandoc texlive-latex-extra`);
        } else {
            log.error(`Erro ao converter: ${inputFile}`);
            console.error(error.message);
        }
        return false;
    }
}

async function main() {
    log.title('Converter Markdown para PDF');

    console.log(`Entrada: ${inputDir}`);
    console.log(`Saída: ${outputDir}`);

    // Criar diretório de saída
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
        log.info(`Diretório criado: ${outputDir}`);
    }

    // Encontrar arquivos markdown
    const files = [];
    function findMarkdownFiles(dir) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                findMarkdownFiles(fullPath);
            } else if (entry.isFile() && entry.name.endsWith('.md')) {
                files.push(fullPath);
            }
        }
    }

    findMarkdownFiles(inputDir);

    if (files.length === 0) {
        log.error(`Nenhum arquivo .md encontrado em ${inputDir}`);
        process.exit(1);
    }

    console.log(`\nEncontrados ${files.length} arquivo(s) markdown\n`);

    // Converter todos os arquivos
    let successCount = 0;
    for (const file of files) {
        const result = await convertFile(file);
        if (result) successCount++;
    }

    log.title(`Conversão Concluída`);
    console.log(`Total: ${files.length}`);
    console.log(`${colors.green}Sucesso: ${successCount}${colors.reset}`);

    // Listar PDFs criados
    if (successCount > 0) {
        const pdfFiles = fs.readdirSync(outputDir).filter(f => f.endsWith('.pdf'));
        console.log(`\n${colors.green}PDFs gerados em: ${outputDir}${colors.reset}`);
        pdfFiles.forEach(file => {
            const stats = fs.statSync(path.join(outputDir, file));
            const size = (stats.size / 1024).toFixed(2);
            console.log(`  📄 ${file} (${size} KB)`);
        });
    }
}

main().catch(error => {
    log.error(`Erro fatal: ${error.message}`);
    process.exit(1);
});
