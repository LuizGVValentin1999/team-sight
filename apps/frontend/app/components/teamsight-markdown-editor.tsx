'use client';

import dynamic from 'next/dynamic';
import type { ICommand } from '@uiw/react-md-editor';
import { translateMdCommandPtBr } from './markdown-editor-pt-br';

const MDEditor = dynamic(() => import('@uiw/react-md-editor'), {
  ssr: false
});

type TeamSightMarkdownEditorProps = {
  value: string;
  onChange: (nextValue: string) => void;
  colorMode: 'light' | 'dark';
  height: number;
  placeholder: string;
};

export function TeamSightMarkdownEditor({
  value,
  onChange,
  colorMode,
  height,
  placeholder
}: TeamSightMarkdownEditorProps) {
  return (
    <div data-color-mode={colorMode}>
      <MDEditor
        value={value}
        onChange={(nextValue) => onChange(nextValue ?? '')}
        preview="edit"
        commandsFilter={(command: ICommand) => translateMdCommandPtBr(command)}
        overflow={false}
        visibleDragbar={false}
        textareaProps={{ placeholder }}
        height={height}
      />
    </div>
  );
}
