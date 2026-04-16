import type { ICommand } from '@uiw/react-md-editor';

function resolveCommandLabel(command: ICommand): string | null {
  if (command.keyCommand === 'preview') {
    if (command.value === 'edit') {
      return 'Editar';
    }
    if (command.value === 'preview') {
      return 'Visualizar';
    }
    if (command.value === 'live') {
      return 'Dividido';
    }
  }

  if (command.keyCommand === 'list') {
    if (command.name === 'unordered-list') {
      return 'Lista não ordenada';
    }
    if (command.name === 'ordered-list') {
      return 'Lista ordenada';
    }
    if (command.name === 'checked-list') {
      return 'Lista de tarefas';
    }
  }

  const labelByKey: Record<string, string> = {
    heading1: 'Título 1',
    heading2: 'Título 2',
    heading3: 'Título 3',
    heading4: 'Título 4',
    heading5: 'Título 5',
    heading6: 'Título 6',
    bold: 'Negrito',
    italic: 'Itálico',
    strikethrough: 'Riscado',
    quote: 'Citação',
    link: 'Link',
    image: 'Imagem',
    table: 'Tabela',
    hr: 'Linha horizontal',
    code: 'Código inline',
    codeBlock: 'Bloco de código',
    comment: 'Comentário',
    issue: 'Aviso',
    help: 'Ajuda'
  };

  return command.keyCommand ? labelByKey[command.keyCommand] ?? null : null;
}

export function translateMdCommandPtBr(command: ICommand): false | ICommand {
  if (command.keyCommand === 'fullscreen') {
    return false;
  }

  const translated: ICommand = { ...command };
  const groupCommand = translated as ICommand & { children?: ICommand[] };

  if (Array.isArray(groupCommand.children)) {
    groupCommand.children = groupCommand.children
      .map((child) => translateMdCommandPtBr(child))
      .filter((child): child is ICommand => Boolean(child));
  }

  const label = resolveCommandLabel(command);

  if (!label) {
    return translated;
  }

  translated.buttonProps = {
    ...(command.buttonProps ?? {}),
    title: label,
    'aria-label': label
  };

  return translated;
}
